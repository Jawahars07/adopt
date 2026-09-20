import { NextResponse } from "next/server";
import { isSensitivity, type Sensitivity } from "@/lib/catalog";
import { LIMITS, rateLimit, readJsonBody, sanitizeText } from "@/lib/guard";
import { route } from "@/lib/routing";
import { createUseCase, getWorkspace } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Route a task across the organisation's licensed stack.
 *
 * Deterministic: no model call, so this cannot be prompt-injected and cannot
 * fail because a provider is down. The task text is still sanitised, because it
 * is persisted and rendered back.
 */
export async function POST(req: Request) {
  const limit = rateLimit(req, "route-task", 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Give it a minute." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const body = await readJsonBody(req);
  if (!body) return NextResponse.json({ error: "Malformed or oversized request." }, { status: 400 });

  const task = sanitizeText(body.task, LIMITS.TASK_MAX);
  if (!task) return NextResponse.json({ error: "Describe the task first." }, { status: 400 });

  const sensitivity: Sensitivity = isSensitivity(body.sensitivity) ? body.sensitivity : "internal";
  const department = sanitizeText(body.department, 60) || null;

  const ws = await getWorkspace();

  // Observed adoption per tool and category feeds the ranking, so routing
  // improves from what actually stuck rather than from the catalog's opinion.
  const evidence = buildEvidence(ws.useCases);

  const result = route({ task, sensitivity, stack: ws.stack, evidence });

  const id = `uc-${crypto.randomUUID().slice(0, 12)}`;
  try {
    await createUseCase({
      id,
      orgId: ws.org.id,
      task,
      category: result.category,
      sensitivity,
      department,
      routedTool: result.primary?.slug ?? null,
      routedScore: result.primary?.score ?? null,
      needsOrgContext: result.needsOrgContext,
      gapKind: result.gap?.kind ?? null,
    });
  } catch (err) {
    // Persistence failing must not deny the person their answer.
    console.error("[adopt] could not persist use case:", err);
  }

  return NextResponse.json({ id, ...result });
}

type EvidenceRow = { slug: string; category: string; attempts: number; adopted: number; avgRating: number };

function buildEvidence(useCases: Awaited<ReturnType<typeof getWorkspace>>["useCases"]) {
  const cells = new Map<string, EvidenceRow>();
  for (const uc of useCases) {
    if (!uc.routedTool || !uc.feedback) continue;
    const key = `${uc.routedTool}::${uc.category}`;
    const cur = cells.get(key) ?? {
      slug: uc.routedTool,
      category: uc.category,
      attempts: 0,
      adopted: 0,
      avgRating: 0,
    };
    cur.attempts += 1;
    if (uc.feedback.adopted) cur.adopted += 1;
    cur.avgRating = (cur.avgRating * (cur.attempts - 1) + (uc.feedback.rating || 0)) / cur.attempts;
    cells.set(key, cur);
  }
  return [...cells.values()] as never;
}
