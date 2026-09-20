/**
 * Analytics — the join that is the product.
 *
 * Vendor consoles report seats and activity. Adopt reports task-level evidence.
 * Neither alone supports a decision. A seat sitting idle could mean the person
 * is on leave, or that the tool is wrong for every task they have, and the only
 * way to tell is to look at what they tried and what stopped them.
 *
 * Everything here is a pure function over rows, so the same code serves the
 * Postgres path and the demo path, and every number is reproducible.
 */

import { BLOCKER_BY_ID, isBlockerId, type BlockerDef, type BlockerId } from "./blockers";
import { TASK_CATEGORY_LABEL, TOOL_BY_SLUG, type TaskCategory, type ToolSlug } from "./catalog";
import { findCoverageGaps, findOverlaps, type OrgTool, type Overlap } from "./routing";

// ── Shared row shapes ────────────────────────────────────────────────────────

export type UseCaseRow = {
  id: string;
  category: TaskCategory;
  department: string | null;
  routedTool: ToolSlug | null;
  gapKind: string | null;
  createdAt: string;
  feedback: { adopted: boolean; rating: number; blocker: string | null } | null;
};

export type UsageRow = {
  toolSlug: ToolSlug;
  month: string;
  licensedSeats: number;
  activeSeats: number;
};

export type ShadowRow = {
  id: string;
  category: TaskCategory;
  toolUsed: string;
  reason: string | null;
  sensitivity: string | null;
  department: string | null;
  createdAt: string;
  /**
   * The gap the router raised on the originating use case, when there was one:
   * no-tool-licensed | poor-fit | blocked-by-policy.
   *
   * Recorded rather than inferred. An earlier version tried to deduce after the
   * fact whether the stack "should have" covered a category, which produced a
   * defensible-looking number built on a guess. This is what actually happened
   * at the moment the person was turned away.
   */
  gapKind: string | null;
};

// ── Ledger ───────────────────────────────────────────────────────────────────

export type VerdictKind = "scale" | "fix" | "migrate" | "cut" | "watch";

export type LedgerRow = {
  key: string;
  toolSlug: ToolSlug;
  toolName: string;
  category: TaskCategory;
  categoryLabel: string;
  kind: VerdictKind;
  headline: string;
  evidence: string;
  action: string | null;
  attempts: number;
  adopted: number;
  adoptionRate: number;
  avgRating: number;
  dominantBlocker: BlockerDef | null;
  dominantShare: number;
  /** Set on a migrate verdict: where the work should go instead. */
  migrateTo: { slug: ToolSlug; name: string; rate: number; attempts: number } | null;
};

const MIN_SIGNAL = 5;
const SCALE_RATE = 0.65;
const WEAK_RATE = 0.45;
/** A migration target must be clearly better, not marginally better. */
const MIGRATE_MARGIN = 0.25;

type Cell = {
  toolSlug: ToolSlug;
  category: TaskCategory;
  attempts: number;
  adopted: number;
  ratings: number[];
  blockers: Partial<Record<BlockerId, number>>;
};

function tabulate(useCases: UseCaseRow[]): Map<string, Cell> {
  const cells = new Map<string, Cell>();
  for (const uc of useCases) {
    if (!uc.routedTool || !uc.feedback) continue;
    const key = `${uc.routedTool}::${uc.category}`;
    const cell = cells.get(key) ?? {
      toolSlug: uc.routedTool,
      category: uc.category,
      attempts: 0,
      adopted: 0,
      ratings: [],
      blockers: {},
    };
    cell.attempts += 1;
    if (uc.feedback.adopted) cell.adopted += 1;
    if (typeof uc.feedback.rating === "number") cell.ratings.push(uc.feedback.rating);
    const b = uc.feedback.blocker;
    if (!uc.feedback.adopted && isBlockerId(b)) cell.blockers[b] = (cell.blockers[b] ?? 0) + 1;
    cells.set(key, cell);
  }
  return cells;
}

/**
 * Build the ledger.
 *
 * The verdict that matters most is MIGRATE, and it is only computable because
 * the same organisation runs several tools. When one tool is being abandoned for
 * a category and another licensed tool is demonstrably winning that same
 * category, the answer is not "train people harder" and not "stop doing this" —
 * it is "you already own the right tool, the work is going to the wrong one".
 * A single-vendor dashboard cannot see this; it has nothing to compare against.
 */
export function buildLedger(useCases: UseCaseRow[]): LedgerRow[] {
  const cells = tabulate(useCases);

  // Best observed performer per category, for migration targets.
  const bestByCategory = new Map<TaskCategory, { slug: ToolSlug; rate: number; attempts: number }>();
  for (const cell of cells.values()) {
    if (cell.attempts < MIN_SIGNAL) continue;
    const rate = cell.adopted / cell.attempts;
    const cur = bestByCategory.get(cell.category);
    if (!cur || rate > cur.rate) {
      bestByCategory.set(cell.category, { slug: cell.toolSlug, rate, attempts: cell.attempts });
    }
  }

  const rows: LedgerRow[] = [];

  for (const cell of cells.values()) {
    const tool = TOOL_BY_SLUG[cell.toolSlug];
    if (!tool) continue;

    const rate = cell.attempts > 0 ? cell.adopted / cell.attempts : 0;
    const adoptionRate = Math.round(rate * 100);
    const avgRating = cell.ratings.length
      ? cell.ratings.reduce((s, r) => s + r, 0) / cell.ratings.length
      : 0;

    const tallies = (Object.entries(cell.blockers) as [BlockerId, number][]).sort((a, b) => b[1] - a[1]);
    const totalBlockers = tallies.reduce((s, [, n]) => s + n, 0);
    const dominantBlocker = tallies.length ? BLOCKER_BY_ID[tallies[0][0]] : null;
    const dominantShare = totalBlockers ? Math.round((tallies[0][1] / totalBlockers) * 100) : 0;

    const base = {
      key: `${cell.toolSlug}::${cell.category}`,
      toolSlug: cell.toolSlug,
      toolName: tool.name,
      category: cell.category,
      categoryLabel: TASK_CATEGORY_LABEL[cell.category],
      attempts: cell.attempts,
      adopted: cell.adopted,
      adoptionRate,
      avgRating: Math.round(avgRating * 10) / 10,
      dominantBlocker,
      dominantShare,
      migrateTo: null as LedgerRow["migrateTo"],
    };

    if (cell.attempts < MIN_SIGNAL) {
      rows.push({
        ...base,
        kind: "watch",
        headline: "Not enough signal yet.",
        evidence: `${cell.attempts} recorded ${cell.attempts === 1 ? "attempt" : "attempts"}; a verdict needs ${MIN_SIGNAL}.`,
        action: null,
      });
      continue;
    }

    if (rate >= SCALE_RATE && avgRating >= 3.5) {
      rows.push({
        ...base,
        kind: "scale",
        headline: "Working. Widen it.",
        evidence: `Adopted ${cell.adopted}/${cell.attempts} (${adoptionRate}%), rated ${base.avgRating}/5.`,
        action: `Make ${tool.name} the default route for ${TASK_CATEGORY_LABEL[cell.category].toLowerCase()} and tell the teams not yet using it.`,
      });
      continue;
    }

    // Is another licensed tool clearly better at this exact category?
    const best = bestByCategory.get(cell.category);
    if (best && best.slug !== cell.toolSlug && best.rate - rate >= MIGRATE_MARGIN) {
      const target = TOOL_BY_SLUG[best.slug];
      rows.push({
        ...base,
        kind: "migrate",
        headline: `Move this work to ${target.name}.`,
        evidence: `${tool.name} holds ${adoptionRate}% adoption across ${cell.attempts} attempts here, while ${target.name} holds ${Math.round(best.rate * 100)}% across ${best.attempts}. You already pay for both.`,
        action: `Re-route ${TASK_CATEGORY_LABEL[cell.category].toLowerCase()} to ${target.name}. No procurement needed — this is a routing change, not a purchase.`,
        migrateTo: { slug: target.slug, name: target.name, rate: Math.round(best.rate * 100), attempts: best.attempts },
      });
      continue;
    }

    if (rate <= WEAK_RATE && dominantBlocker?.structural) {
      rows.push({
        ...base,
        kind: "cut",
        headline: `Stop routing this here — "${dominantBlocker.label}".`,
        evidence: `${adoptionRate}% adoption across ${cell.attempts} attempts, and ${dominantShare}% of rejections cite "${dominantBlocker.label}" — a property of the task, not the prompt.`,
        action: dominantBlocker.intervention,
      });
      continue;
    }

    if (dominantBlocker && !dominantBlocker.structural) {
      rows.push({
        ...base,
        kind: "fix",
        headline: "Fixable — right tool, wrong execution.",
        evidence: `${adoptionRate}% adoption across ${cell.attempts} attempts, ${dominantShare}% of rejections citing "${dominantBlocker.label}".`,
        action: dominantBlocker.intervention,
      });
      continue;
    }

    rows.push({
      ...base,
      kind: "watch",
      headline: "Underperforming, no reason recorded.",
      evidence: `${adoptionRate}% adoption across ${cell.attempts} attempts with no blocker captured.`,
      action: "Make the blocker question mandatory here so the next rejection is diagnosable.",
    });
  }

  const order: Record<VerdictKind, number> = { migrate: 0, cut: 1, fix: 2, scale: 3, watch: 4 };
  return rows.sort((a, b) => (order[a.kind] - order[b.kind]) || b.attempts - a.attempts);
}

// ── Stack report ─────────────────────────────────────────────────────────────

export type ToolVerdict = "scale" | "keep" | "consolidate" | "cut";

export type StackToolRow = {
  slug: ToolSlug;
  name: string;
  vendor: string;
  seats: number;
  activeSeats: number;
  /** Share of licensed seats showing activity, 0-100. */
  utilisation: number;
  monthlyPriceEur: number;
  annualCostEur: number;
  /** Seats with no activity, valued at the org's own price. */
  idleSeats: number;
  idleAnnualEur: number;
  /** Adoption across all task evidence for this tool, 0-100, or null. */
  taskAdoption: number | null;
  taskAttempts: number;
  verdict: ToolVerdict;
  rationale: string;
  trend: number[];
};

export type StackReport = {
  tools: StackToolRow[];
  totalSeats: number;
  totalActiveSeats: number;
  totalAnnualEur: number;
  /** Idle seats valued at price — the headline number. */
  reclaimableAnnualEur: number;
  reclaimableSeats: number;
  overlaps: Overlap[];
  coverageGaps: { category: TaskCategory; label: string }[];
};

export function buildStackReport(
  stack: OrgTool[],
  usage: UsageRow[],
  useCases: UseCaseRow[],
  headcount?: number,
): StackReport {
  const latestMonth = usage.reduce((m, r) => (r.month > m ? r.month : m), "");

  // Task adoption per tool, across every category.
  const perTool = new Map<ToolSlug, { attempts: number; adopted: number }>();
  for (const uc of useCases) {
    if (!uc.routedTool || !uc.feedback) continue;
    const cur = perTool.get(uc.routedTool) ?? { attempts: 0, adopted: 0 };
    cur.attempts += 1;
    if (uc.feedback.adopted) cur.adopted += 1;
    perTool.set(uc.routedTool, cur);
  }

  const tools: StackToolRow[] = stack.map((org) => {
    const profile = TOOL_BY_SLUG[org.slug];
    const latest = usage.find((u) => u.toolSlug === org.slug && u.month === latestMonth);
    const activeSeats = latest?.activeSeats ?? 0;
    const utilisation = org.seats > 0 ? Math.round((activeSeats / org.seats) * 100) : 0;
    const idleSeats = Math.max(0, org.seats - activeSeats);
    const annualCostEur = org.seats * org.monthlyPriceEur * 12;
    const idleAnnualEur = idleSeats * org.monthlyPriceEur * 12;

    const t = perTool.get(org.slug);
    const taskAdoption = t && t.attempts >= MIN_SIGNAL ? Math.round((t.adopted / t.attempts) * 100) : null;

    const trend = usage
      .filter((u) => u.toolSlug === org.slug)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((u) => (u.licensedSeats > 0 ? Math.round((u.activeSeats / u.licensedSeats) * 100) : 0));

    // Verdict combines both signals. Utilisation alone is the mistake every
    // usage dashboard makes: a tool can be widely opened and still be failing
    // the tasks it is opened for.
    let verdict: ToolVerdict;
    let rationale: string;
    if (utilisation >= 60 && (taskAdoption ?? 100) >= 65) {
      verdict = "scale";
      rationale = `${utilisation}% of seats active and ${taskAdoption ?? "—"}% task adoption. This one earns its money.`;
    } else if (utilisation < 30) {
      verdict = "cut";
      rationale = `Only ${utilisation}% of ${org.seats} seats show any activity. ${idleSeats.toLocaleString()} seats are paid for and untouched.`;
    } else if (taskAdoption !== null && taskAdoption < 40) {
      verdict = "consolidate";
      rationale = `Seats are open (${utilisation}%) but the work is not sticking — ${taskAdoption}% task adoption. People log in and then go elsewhere.`;
    } else {
      verdict = "keep";
      rationale = `${utilisation}% seat activity${taskAdoption !== null ? `, ${taskAdoption}% task adoption` : ""}. Holding steady.`;
    }

    return {
      slug: org.slug,
      name: profile?.name ?? org.slug,
      vendor: profile?.vendor ?? "",
      seats: org.seats,
      activeSeats,
      utilisation,
      monthlyPriceEur: org.monthlyPriceEur,
      annualCostEur,
      idleSeats,
      idleAnnualEur,
      taskAdoption,
      taskAttempts: t?.attempts ?? 0,
      verdict,
      rationale,
      trend,
    };
  });

  // Plain licensing check. An earlier version weighted this by seat share of
  // headcount, which wrongly called "code" a gap because only engineers hold
  // coding seats. Coverage is about whether the organisation owns a capable
  // tool; whether the right people can reach it is a separate question the
  // per-tool utilisation column already answers.
  const gaps = findCoverageGaps(stack);

  return {
    tools: tools.sort((a, b) => b.idleAnnualEur - a.idleAnnualEur),
    totalSeats: tools.reduce((s, t) => s + t.seats, 0),
    totalActiveSeats: tools.reduce((s, t) => s + t.activeSeats, 0),
    totalAnnualEur: tools.reduce((s, t) => s + t.annualCostEur, 0),
    reclaimableAnnualEur: tools.reduce((s, t) => s + t.idleAnnualEur, 0),
    reclaimableSeats: tools.reduce((s, t) => s + t.idleSeats, 0),
    overlaps: findOverlaps(stack),
    coverageGaps: gaps.map((c) => ({ category: c, label: TASK_CATEGORY_LABEL[c] })),
  };
}

// ── Shadow report ────────────────────────────────────────────────────────────

export type ShadowCluster = {
  category: TaskCategory;
  label: string;
  events: number;
  topTool: string;
  /** True when no licensed tool covers this category — a buy signal, not a policy problem. */
  isCoverageGap: boolean;
  sensitiveEvents: number;
};

export type ShadowReport = {
  total: number;
  sensitiveTotal: number;
  clusters: ShadowCluster[];
  topTools: { tool: string; count: number }[];
  /**
   * Share of shadow use that happened because the router turned the person away
   * — no licensed tool, or one blocked by policy. The rest is preference.
   *
   * This is the number that reframes the meeting: when most unapproved use
   * traces to a gap the organisation created, the remedy is a purchase or a
   * policy change, not a warning email.
   */
  explainedByGaps: number;
};

/**
 * Shadow AI as a routing signal.
 *
 * Sixty-seven percent of US workers report using unapproved AI tools, and IBM
 * found shadow AI involved in 43% of AI-related security incidents. The usual
 * response is detection and blocking. That treats the symptom: people are not
 * using personal accounts because they enjoy risk, they are using them because
 * the sanctioned stack did not do the job.
 *
 * `explainedByGaps` is the number that reframes the conversation. When most
 * shadow use lands in categories no licensed tool covers, the fix is a purchase
 * order, not a policy memo.
 */
export function buildShadowReport(shadow: ShadowRow[], stack: OrgTool[]): ShadowReport {
  // Approval-aware: a tool not cleared for sensitive material does not cover
  // sensitive work in that category, however capable the catalog says it is.
  const gaps = new Set(findCoverageGaps(stack, { requireApproved: true }));
  const byCategory = new Map<TaskCategory, ShadowRow[]>();
  const byTool = new Map<string, number>();

  for (const ev of shadow) {
    byCategory.set(ev.category, [...(byCategory.get(ev.category) ?? []), ev]);
    byTool.set(ev.toolUsed, (byTool.get(ev.toolUsed) ?? 0) + 1);
  }

  const clusters: ShadowCluster[] = [...byCategory.entries()]
    .map(([category, evs]) => {
      const toolCounts = new Map<string, number>();
      for (const e of evs) toolCounts.set(e.toolUsed, (toolCounts.get(e.toolUsed) ?? 0) + 1);
      const topTool = [...toolCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
      return {
        category,
        label: TASK_CATEGORY_LABEL[category],
        events: evs.length,
        topTool,
        isCoverageGap: gaps.has(category),
        sensitiveEvents: evs.filter((e) => e.sensitivity === "confidential" || e.sensitivity === "personal-data").length,
      };
    })
    .sort((a, b) => b.events - a.events);

  // Counted from what the router recorded at the time, not reconstructed.
  const explained = shadow.filter((e) => e.gapKind !== null).length;

  return {
    total: shadow.length,
    sensitiveTotal: clusters.reduce((s, c) => s + c.sensitiveEvents, 0),
    clusters,
    topTools: [...byTool.entries()]
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    explainedByGaps: shadow.length ? Math.round((explained / shadow.length) * 100) : 0,
  };
}
