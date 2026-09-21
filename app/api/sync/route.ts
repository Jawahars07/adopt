import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { isToolSlug } from "@/lib/catalog";
import { rateLimit, readJsonBody, sanitizeText } from "@/lib/guard";
import { getWorkspace } from "@/lib/store";
import { syncAll, syncConnection } from "@/lib/sync";

export const runtime = "nodejs";
// Vendor APIs paginate and rate-limit; a large tenant takes a while.
export const maxDuration = 60;

/**
 * Trigger a sync.
 *
 * Rate-limited hard. Each call fans out into authenticated requests against a
 * customer's vendor APIs, and hammering this endpoint means hammering their
 * Microsoft tenant — the kind of thing that gets an integration's credentials
 * revoked rather than an error returned.
 */
export async function POST(req: Request) {
  // Throttle BEFORE authenticating. With the order reversed, requireAdmin
  // returns 401 on a bad token and the limiter below is never reached, so the
  // only requests being rate-limited are the ones that already proved they hold
  // the token. Verified on /api/connections: 30 consecutive bad-token requests
  // all returned 401 and not one 429. That made the admin endpoints the cheapest
  // surface to brute-force the token against.
  const limit = rateLimit(req, "sync", 6, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Sync is rate-limited. Wait a minute." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await readJsonBody(req);
  const slug = sanitizeText(body?.toolSlug, 60);
  const lookbackDays = Math.min(180, Math.max(7, Number(body?.lookbackDays) || 30));

  try {
    const ws = await getWorkspace();
    const results = isToolSlug(slug)
      ? [await syncConnection(ws.org.id, slug, lookbackDays)]
      : await syncAll(ws.org.id, lookbackDays);
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message.slice(0, 300) : "Sync failed." },
      { status: 500 },
    );
  }
}
