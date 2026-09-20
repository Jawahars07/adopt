/**
 * The Abandonment Ledger — what Adopt does that the incumbents structurally cannot.
 *
 * Every adoption tool on the market measures the same thing: usage. Microsoft's
 * Copilot Dashboard in Viva Insights, the Analytics Hub Power BI templates and the
 * M365 admin reports all count active users, feature utilisation, licence
 * utilisation and assisted hours. The digital-adoption platforms (WalkMe, Whatfix,
 * Pendo, Lemon Learning) layer guided walkthroughs on top of the same counters.
 * Lemon Learning names the gap in its own marketing: those dashboards "cannot
 * reveal where users get stuck."
 *
 * That gap matters because the failure numbers are the story. 88% of AI pilots
 * never reach production. 40.7% of organisations cancelled a GenAI assistant
 * rollout in 2026, up from 31.7% in 2025. Gartner has 42% abandoning most AI
 * initiatives. 84% of failures trace to a decision, not to the technology.
 *
 * A usage dashboard reports the symptom — the line went down. It cannot tell you
 * WHY, because it never captured a reason, so the only available response is more
 * training and more nudges. Adopt captures the reason at the moment of rejection,
 * attributes it to a use-case pattern, and turns it into a decision: scale this,
 * fix this specific thing, or stop spending licences on this.
 *
 * Recommending KILL is the point. No vendor whose revenue depends on seat
 * expansion will ever tell a customer to stop using a use case. That is the
 * position this file occupies.
 */

import type { PlaybookEntry, StoredUseCase } from "./types";

// ── The taxonomy ─────────────────────────────────────────────────────────────

export type BlockerId = "trust" | "quality" | "workflow" | "data" | "speed";

export type BlockerDef = {
  id: BlockerId;
  /** What the colleague picks — written as they'd say it, not as a category name. */
  label: string;
  /** Shown under the label in the feedback UI. */
  hint: string;
  /**
   * Structural blockers are properties of the task itself — no amount of prompt
   * engineering or training moves them. They drive a KILL verdict. Fixable
   * blockers are addressable with a better prompt, a different surface, or
   * enablement, and drive a FIX verdict.
   */
  structural: boolean;
  /** The concrete intervention to run next. */
  intervention: string;
};

export const BLOCKERS: BlockerDef[] = [
  {
    id: "quality",
    label: "The output needed too much editing",
    hint: "It got there eventually, but rewriting it ate the time saved.",
    structural: false,
    intervention:
      "Execution problem, not a tool problem. Tighten the prompt first — an explicit output format and an instruction to flag uncertainty. If a second tool in the stack scores higher for this category, re-route before rewriting again.",
  },
  {
    id: "workflow",
    label: "It didn't fit how I actually work",
    hint: "Wrong app, too many steps, or it broke my flow to use it.",
    structural: false,
    intervention:
      "Routing problem. The task suits AI but landed in the wrong place — the tool sits beside the work instead of inside it. Re-route to a tool that reaches the system where the work already happens, or make it an agent that runs in that process.",
  },
  {
    id: "trust",
    label: "I couldn't trust the output enough to use it",
    hint: "I had to check everything, so I might as well have done it myself.",
    structural: true,
    intervention:
      "Verification cost exceeds the drafting saving. Worth keeping only where a human already reviews the output as part of the process. If the task is high-stakes and unreviewed, stop promoting it — and check whether a tool grounded in your own systems would remove the doubt.",
  },
  {
    id: "data",
    label: "I couldn't use it with this data",
    hint: "Confidential, personal, or the model couldn't reach the right source.",
    structural: true,
    intervention:
      "Governance blocker, not an adoption blocker. Either the material is not cleared for this tool or the tool cannot reach the source. Check whether another licensed tool is already approved for this data class before escalating — the answer is often a re-route, not a policy change.",
  },
  {
    id: "speed",
    label: "It was faster to just do it myself",
    hint: "By the time I explained it, I'd have finished the task.",
    structural: true,
    intervention:
      "Negative time-to-value. The task is too small or too bespoke to carry the cost of instructing a model. Retire it from the playbook and redirect the licence attention to a higher-frequency task.",
  },
];

export const BLOCKER_BY_ID: Record<BlockerId, BlockerDef> = Object.fromEntries(
  BLOCKERS.map((b) => [b.id, b]),
) as Record<BlockerId, BlockerDef>;

export function isBlockerId(v: unknown): v is BlockerId {
  return typeof v === "string" && BLOCKERS.some((b) => b.id === v);
}

// ── Verdicts ─────────────────────────────────────────────────────────────────

export type VerdictKind = "scale" | "fix" | "kill" | "watch";

export type PatternVerdict = {
  pattern: string;
  recommendedTool: string;
  kind: VerdictKind;
  /** One sentence a manager can act on. */
  headline: string;
  /** Why this verdict, in the numbers it was computed from. */
  evidence: string;
  /** What to do next — the dominant blocker's intervention, when there is one. */
  intervention: string | null;
  attempts: number;
  adoptionRate: number;
  dominantBlocker: BlockerDef | null;
  /** How much of the abandonment this one blocker accounts for, 0-100. */
  dominantShare: number;
};

/** Below this many attempts, any rate is noise — say so rather than inventing a verdict. */
const MIN_SIGNAL = 3;
const SCALE_RATE = 0.6;
const KILL_RATE = 0.4;

/**
 * Turn a use-case pattern plus its recorded blockers into a decision.
 *
 * The logic that matters is the FIX/KILL split. Two patterns can have identical
 * adoption rates and deserve opposite responses: one is abandoned because the
 * prompt was sloppy (fixable), the other because the data is confidential
 * (structural). A usage dashboard cannot tell these apart — it sees one number.
 */
export function verdictFor(
  entry: PlaybookEntry,
  blockerCounts: Partial<Record<BlockerId, number>>,
): PatternVerdict {
  const attempts = entry.totalCount;
  const rate = attempts > 0 ? entry.adoptedCount / attempts : 0;
  const adoptionRate = Math.round(rate * 100);

  const tallies = (Object.entries(blockerCounts) as [BlockerId, number][])
    .filter(([id, n]) => isBlockerId(id) && n > 0)
    .sort((a, b) => b[1] - a[1]);
  const totalBlockers = tallies.reduce((s, [, n]) => s + n, 0);
  const dominantBlocker = tallies.length ? BLOCKER_BY_ID[tallies[0][0]] : null;
  const dominantShare = totalBlockers ? Math.round((tallies[0][1] / totalBlockers) * 100) : 0;

  const base = {
    pattern: entry.pattern,
    recommendedTool: entry.recommendedTool,
    attempts,
    adoptionRate,
    dominantBlocker,
    dominantShare,
    intervention: dominantBlocker?.intervention ?? null,
  };

  if (attempts < MIN_SIGNAL) {
    return {
      ...base,
      kind: "watch",
      headline: "Not enough signal yet — keep collecting.",
      evidence: `${attempts} recorded ${attempts === 1 ? "attempt" : "attempts"}; a verdict needs at least ${MIN_SIGNAL}.`,
      intervention: null,
    };
  }

  if (rate >= SCALE_RATE && entry.avgRating >= 3.5) {
    return {
      ...base,
      kind: "scale",
      headline: "Working. Promote it to the next team.",
      evidence: `Adopted ${entry.adoptedCount}/${attempts} times (${adoptionRate}%), rated ${entry.avgRating.toFixed(1)}/5.`,
      intervention: null,
    };
  }

  if (rate <= KILL_RATE && dominantBlocker?.structural) {
    return {
      ...base,
      kind: "kill",
      headline: `Stop promoting this — "${dominantBlocker.label}".`,
      evidence: `Only ${entry.adoptedCount}/${attempts} adopted (${adoptionRate}%), and ${dominantShare}% of the rejections are "${dominantBlocker.label}" — a property of the task, not of the prompt.`,
      intervention: dominantBlocker.intervention,
    };
  }

  if (dominantBlocker && !dominantBlocker.structural) {
    return {
      ...base,
      kind: "fix",
      headline: "Fixable — the task is right, the execution isn't.",
      evidence: `${adoptionRate}% adoption across ${attempts} attempts, with ${dominantShare}% of rejections citing "${dominantBlocker.label}".`,
      intervention: dominantBlocker.intervention,
    };
  }

  return {
    ...base,
    kind: "watch",
    headline: "Underperforming, but no reason was recorded.",
    evidence: `${adoptionRate}% adoption across ${attempts} attempts with no blocker captured — ask the next person who abandons it why.`,
    intervention: "Make the blocker question mandatory for this pattern so the next rejection is diagnosable.",
  };
}

// ── Roll-up ──────────────────────────────────────────────────────────────────

export type LedgerRow = PatternVerdict & { id: string };

/**
 * Build the ledger from stored cases plus the learned playbook.
 *
 * Blockers live on the individual case, adoption counts live on the playbook
 * entry, and they are joined on the same id `learnFromFeedback` derives, so the
 * two halves of the flywheel stay consistent.
 */
export function buildLedger(cases: StoredUseCase[], learned: PlaybookEntry[]): LedgerRow[] {
  const byEntry = new Map<string, Partial<Record<BlockerId, number>>>();

  for (const c of cases) {
    if (c.adopted || !isBlockerId(c.blocker)) continue;
    const id = entryIdFor(c.recommendedTool);
    const counts = byEntry.get(id) ?? {};
    counts[c.blocker] = (counts[c.blocker] ?? 0) + 1;
    byEntry.set(id, counts);
  }

  return learned
    .map((e) => ({ id: e.id, ...verdictFor(e, byEntry.get(e.id) ?? {}) }))
    .sort((a, b) => {
      // Decisions first, then what is working, then what has no signal yet.
      // "watch" sorts last because it is the absence of a verdict, not a verdict.
      const order: Record<VerdictKind, number> = { kill: 0, fix: 1, scale: 2, watch: 3 };
      if (order[a.kind] !== order[b.kind]) return order[a.kind] - order[b.kind];
      return b.attempts - a.attempts;
    });
}

/** The id `learnFromFeedback` derives, kept in one place so both sides agree. */
export function entryIdFor(recommendedTool: string): string {
  return `learned-${recommendedTool}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/**
 * Wasted-effort estimate: attempts that ended in abandonment.
 * Deliberately a count of real recorded events, never a currency figure — an
 * invented "€X saved" number is exactly the kind of claim this project refuses.
 */
export function abandonmentSummary(rows: LedgerRow[]) {
  const withSignal = rows.filter((r) => r.kind !== "watch" || r.attempts >= MIN_SIGNAL);
  const attempts = withSignal.reduce((s, r) => s + r.attempts, 0);
  const abandoned = withSignal.reduce(
    (s, r) => s + Math.round(r.attempts * (1 - r.adoptionRate / 100)),
    0,
  );
  return {
    attempts,
    abandoned,
    killCount: rows.filter((r) => r.kind === "kill").length,
    fixCount: rows.filter((r) => r.kind === "fix").length,
    scaleCount: rows.filter((r) => r.kind === "scale").length,
  };
}
