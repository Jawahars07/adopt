import { NextResponse } from "next/server";
import { isBlockerId } from "@/lib/blockers";
import { LIMITS, rateLimit, readJsonBody, sanitizeText } from "@/lib/guard";
import { getWorkspace, recordFeedback, recordShadowEvent } from "@/lib/store";
import type { TaskCategory } from "@/lib/catalog";

export const runtime = "nodejs";

/**
 * Record what happened after someone tried the recommendation — and, when the
 * work left the stack, what they used instead.
 *
 * The shadow branch is the one that matters. Every other adoption product would
 * treat "I used my personal ChatGPT" as a compliance incident. Here it is
 * evidence: a task the organisation failed to serve, filed next to the reason.
 */
export async function POST(req: Request) {
  const limit = rateLimit(req, "feedback", 40, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const body = await readJsonBody(req);
  if (!body) return NextResponse.json({ error: "Malformed or oversized request." }, { status: 400 });

  const useCaseId = sanitizeText(body.useCaseId, 80);
  if (!useCaseId) return NextResponse.json({ error: "Missing use case." }, { status: 400 });

  const ws = await getWorkspace();
  const adopted = body.adopted === true;
  const ratingRaw = Number(body.rating);
  const rating = Number.isFinite(ratingRaw) ? Math.min(5, Math.max(1, Math.round(ratingRaw))) : null;
  const blocker = isBlockerId(body.blocker) ? body.blocker : null;

  try {
    await recordFeedback(ws.org.id, useCaseId, adopted, rating, blocker);
  } catch (err) {
    console.error("[adopt] could not persist feedback:", err);
  }

  // Shadow capture, if they told us where the work actually went.
  const shadowTool = sanitizeText(body.shadowTool, 120);
  if (shadowTool) {
    try {
      await recordShadowEvent({
        id: `sh-${crypto.randomUUID().slice(0, 12)}`,
        orgId: ws.org.id,
        useCaseId,
        category: (sanitizeText(body.category, 40) || "docs") as TaskCategory,
        toolUsed: shadowTool,
        reason: sanitizeText(body.shadowReason, LIMITS.PAIN_POINT_MAX) || null,
        sensitivity: sanitizeText(body.sensitivity, 30) || null,
        department: sanitizeText(body.department, 60) || null,
        gapKind: sanitizeText(body.gapKind, 40) || null,
      });
    } catch (err) {
      console.error("[adopt] could not persist shadow event:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
