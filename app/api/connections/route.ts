import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getConnector } from "@/lib/connectors";
import { isEncryptionConfigured, scrubError } from "@/lib/crypto";
import { isToolSlug } from "@/lib/catalog";
import { LIMITS, rateLimit, readJsonBody, sanitizeText } from "@/lib/guard";
import { deleteConnection, getWorkspace, saveConnection } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Store vendor credentials.
 *
 * Only the fields a connector declares are accepted, and the connector decides
 * which of them are secret. An allowlist rather than a filter: anything the
 * caller sends that the connector did not ask for is dropped, so a crafted body
 * cannot smuggle an extra key into the encrypted blob or the config JSON.
 *
 * Nothing here is ever echoed back. The response confirms which fields were
 * stored, never their values.
 */
export async function POST(req: Request) {
  // Throttle BEFORE authenticating. With the order reversed, requireAdmin
  // returns 401 on a bad token and the limiter below is never reached, so the
  // only requests being rate-limited are the ones that already proved they hold
  // the token. Verified: 30 consecutive bad-token requests all returned 401 and
  // not one 429, against a 20/60s limit. That makes this the cheapest surface to
  // brute-force the admin token against.
  const limit = rateLimit(req, "connections", 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      { error: "ADOPT_ENCRYPTION_KEY is not configured, so credentials cannot be stored safely." },
      { status: 503 },
    );
  }

  const body = await readJsonBody(req);
  if (!body) return NextResponse.json({ error: "Malformed or oversized request." }, { status: 400 });

  const slug = sanitizeText(body.toolSlug, 60);
  if (!isToolSlug(slug)) return NextResponse.json({ error: "Unknown tool." }, { status: 400 });
  const connector = getConnector(slug);
  if (!connector) return NextResponse.json({ error: `No connector for ${slug}.` }, { status: 400 });

  const supplied = (body.fields ?? {}) as Record<string, unknown>;
  const config: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  const missing: string[] = [];

  for (const field of connector.fields) {
    // Private keys are long; ordinary config values are not.
    const value = sanitizeText(supplied[field.key], field.secret ? LIMITS.PROMPT_MAX : 400);
    if (!value) {
      // A secret already stored stays stored, so re-saving config alone does
      // not force the admin to paste a client secret Entra will not show twice.
      if (!field.secret) missing.push(field.label);
      continue;
    }
    if (field.secret) secrets[field.key] = value;
    else config[field.key] = value;
  }

  if (missing.length) {
    return NextResponse.json({ error: `Missing required fields: ${missing.join(", ")}` }, { status: 400 });
  }

  try {
    const ws = await getWorkspace();
    await saveConnection(ws.org.id, slug, config, secrets);
    return NextResponse.json({
      ok: true,
      toolSlug: slug,
      storedConfigKeys: Object.keys(config),
      storedSecretKeys: Object.keys(secrets),
    });
  } catch (err) {
    const message = scrubError(err instanceof Error ? err.message : String(err));
    console.error("[adopt] could not save connection:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  // DELETE had no throttle at all — every other handler had one. Same order as
  // POST: limit first, then authenticate.
  const limit = rateLimit(req, "connections", 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await readJsonBody(req);
  const slug = sanitizeText(body?.toolSlug, 60);
  if (!isToolSlug(slug)) return NextResponse.json({ error: "Unknown tool." }, { status: 400 });

  try {
    const ws = await getWorkspace();
    await deleteConnection(ws.org.id, slug);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: scrubError(err instanceof Error ? err.message : String(err)) },
      { status: 500 },
    );
  }
}
