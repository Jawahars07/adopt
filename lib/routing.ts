/**
 * The routing engine.
 *
 * Given a task and the tools an organisation actually licenses, decide which one
 * should do it — and say honestly when none of them should.
 *
 * That last part is the whole design. A router that always returns an answer is
 * a router that manufactures false confidence, and the cost of that lands
 * somewhere specific: the person tries the recommended tool, it does not fit,
 * they abandon it, and then they paste the task into a personal ChatGPT account.
 * Sixty-seven percent of US workers report doing exactly that. Adopt would
 * rather report a gap in the stack than pretend a bad fit is a good one.
 *
 * Deliberately deterministic and inspectable. Every recommendation carries the
 * reasons that produced it, so a CoE lead can argue with the routing instead of
 * trusting it. A model call can refine the output (see /api/route-task) but the
 * ranking never depends on one.
 */

import {
  CATALOG,
  RESTRICTED,
  TOOL_BY_SLUG,
  type Sensitivity,
  type TaskCategory,
  type ToolProfile,
  type ToolSlug,
} from "./catalog";

// ── Inputs ───────────────────────────────────────────────────────────────────

/** A tool as a specific organisation holds it: seats, price paid, policy status. */
export type OrgTool = {
  slug: ToolSlug;
  seats: number;
  /** Cleared by the organisation for confidential or personal data. */
  approvedForSensitive: boolean;
  /** What this organisation actually pays per seat per month, in EUR. */
  monthlyPriceEur: number;
};

/**
 * Observed adoption for a tool within a task category — the flywheel feeding the
 * router. v1 learned per tool; v2 learns per tool AND category, because
 * "Copilot works here" is only useful when you know which "here".
 */
export type ToolCategoryEvidence = {
  slug: ToolSlug;
  category: TaskCategory;
  attempts: number;
  adopted: number;
  avgRating: number;
};

export type RoutingInput = {
  task: string;
  sensitivity: Sensitivity;
  stack: OrgTool[];
  evidence?: ToolCategoryEvidence[];
};

// ── Outputs ──────────────────────────────────────────────────────────────────

export type Recommendation = {
  slug: ToolSlug;
  name: string;
  vendor: string;
  score: number;
  /** Why this tool, in order of contribution. Shown verbatim in the UI. */
  reasons: string[];
  /** Why it might still disappoint. Always populated when known. */
  caveat: string | null;
  surfaces: string[];
  groundedInOrgData: boolean;
  /** Evidence-backed adoption rate for this tool in this category, when known. */
  observedAdoption: { rate: number; attempts: number } | null;
};

/** Raised when the licensed stack does not serve the task well. */
export type StackGap = {
  kind: "no-tool-licensed" | "poor-fit" | "blocked-by-policy";
  headline: string;
  detail: string;
  /** What the org would need to close it. */
  remedy: string;
};

export type RoutingResult = {
  category: TaskCategory;
  /** 0-1. Low confidence means the classifier guessed; the UI says so. */
  categoryConfidence: number;
  needsOrgContext: boolean;
  sensitivity: Sensitivity;
  primary: Recommendation | null;
  alternates: Recommendation[];
  /** Tools excluded by policy, with the reason. Shown, never silently dropped. */
  excluded: { slug: ToolSlug; name: string; reason: string }[];
  gap: StackGap | null;
};

// ── Classification ───────────────────────────────────────────────────────────

/**
 * Keyword signals per category. Weighted: a distinctive term ("pivot table")
 * counts more than a generic one ("data"). Kept transparent rather than learned
 * so a CoE lead can see exactly why a task landed where it did.
 */
const SIGNALS: Record<TaskCategory, { strong: string[]; weak: string[] }> = {
  email: {
    strong: ["email", "inbox", "outlook", "thread", "reply", "gmail", "unread"],
    weak: ["message", "respond", "send", "follow up", "correspondence"],
  },
  meetings: {
    strong: ["meeting", "transcript", "minutes", "standup", "stand-up", "recap", "action items", "teams call", "zoom"],
    weak: ["notes", "sync", "call", "attendees", "agenda", "debrief"],
  },
  docs: {
    strong: ["draft", "write", "policy", "proposal", "report", "memo", "documentation", "article", "brief"],
    weak: ["document", "text", "wording", "copy", "editing", "rewrite"],
  },
  slides: {
    strong: ["slide", "deck", "powerpoint", "presentation", "pitch", "keynote"],
    weak: ["present", "outline", "storyline"],
  },
  spreadsheet: {
    strong: ["excel", "spreadsheet", "formula", "pivot", "vlookup", "csv", "sheet", "budget model"],
    weak: ["data", "numbers", "chart", "calculate", "forecast", "table"],
  },
  "knowledge-search": {
    strong: ["find", "where is", "sharepoint", "confluence", "intranet", "which policy", "look up", "search for"],
    weak: ["locate", "who owns", "documentation for", "guideline"],
  },
  code: {
    strong: ["code", "function", "bug", "refactor", "pull request", "repository", "api", "unit test", "typescript", "python"],
    weak: ["script", "debug", "deploy", "build", "error"],
  },
  research: {
    strong: ["market research", "competitor", "industry", "benchmark", "landscape", "sources", "cite"],
    weak: ["research", "compare", "trends", "analysis of the market"],
  },
  "long-doc": {
    strong: ["contract", "filing", "whitepaper", "annual report", "rfp", "tender", "legal document", "hundred pages"],
    weak: ["long document", "pdf", "lengthy", "review the attached", "summarise the report"],
  },
  automation: {
    strong: ["every week", "recurring", "automate", "workflow", "agent", "each time", "routine", "repetitive"],
    weak: ["process", "steps", "regularly", "always have to"],
  },
};

/**
 * Recurrence markers. Weighted above ordinary keywords because they describe the
 * SHAPE of the work rather than its artifact: "every week I compile the same
 * status report" is an automation candidate, even though "report" points at
 * document work. The artifact is incidental; the repetition is the opportunity.
 */
const RECURRENCE_MARKERS = [
  "every week", "every month", "every day", "each week", "each month",
  "recurring", "repetitive", "routine", "same report", "same thing",
  "over and over", "always have to", "every time", "weekly", "monthly",
];
const RECURRENCE_WEIGHT = 5;

/** Signals that the task depends on the organisation's own content. */
const ORG_CONTEXT_SIGNALS = [
  "our", "my", "the team", "company", "internal", "sharepoint", "confluence",
  "intranet", "colleague", "client account", "the project", "our policy",
  "last quarter's", "the handbook", "onedrive", "drive", "slack", "notion",
];

/** Phrases that flag sensitive material even if the person picked "internal". */
const SENSITIVE_SIGNALS = [
  "salary", "payroll", "candidate", "employee record", "performance review",
  "patient", "medical", "customer data", "personal data", "gdpr", "nda",
  "confidential", "acquisition", "redundanc", "disciplinary", "passport",
];

function normalise(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").replace(/\s+/g, " ")} `;
}

/**
 * Whole-word containment.
 *
 * Plain `includes` is wrong here and wrong in a way that hides: "our" matches
 * inside "sources", "nda" matches inside "agenda". Both were live bugs — the
 * first granted a spurious org-context bonus that promoted a 44/100 tool to
 * 62/100 and suppressed a gap warning the user needed to see.
 *
 * normalise() guarantees single spaces and leading/trailing padding, so
 * prefixing with a space anchors the match to a word start. Kept as a prefix
 * rather than a full-word match on purpose, so stems like "redundanc" still
 * catch "redundancy".
 */
function hasTerm(text: string, term: string): boolean {
  return text.includes(` ${term}`);
}

export type Classification = {
  category: TaskCategory;
  confidence: number;
  needsOrgContext: boolean;
  /** True when wording suggests sensitivity the user may not have declared. */
  sensitivityWarning: boolean;
  matched: string[];
};

export function classify(task: string): Classification {
  const t = normalise(task);
  const scores = new Map<TaskCategory, number>();
  const matched: string[] = [];

  for (const [category, sig] of Object.entries(SIGNALS) as [TaskCategory, typeof SIGNALS[TaskCategory]][]) {
    let score = 0;
    for (const term of sig.strong) {
      if (hasTerm(t, term)) {
        score += 3;
        matched.push(term);
      }
    }
    for (const term of sig.weak) {
      if (hasTerm(t, term)) score += 1;
    }
    if (score > 0) scores.set(category, score);
  }

  // Recurrence outranks the artifact noun.
  const recurrence = RECURRENCE_MARKERS.filter((m) => hasTerm(t, m));
  if (recurrence.length > 0) {
    scores.set("automation", (scores.get("automation") ?? 0) + RECURRENCE_WEIGHT);
    matched.push(recurrence[0]);
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((s, [, v]) => s + v, 0);

  // Nothing matched: default to general writing, and say confidence is low so
  // the UI can offer a manual category rather than pretending it knew.
  if (ranked.length === 0) {
    return {
      category: "docs",
      confidence: 0.2,
      needsOrgContext: ORG_CONTEXT_SIGNALS.some((sig) => hasTerm(t, sig)),
      sensitivityWarning: SENSITIVE_SIGNALS.some((sig) => hasTerm(t, sig)),
      matched: [],
    };
  }

  const [top, topScore] = ranked[0];
  // Confidence is the winner's share of all signal, tempered by how much signal
  // there was at all. One weak keyword should never read as certainty.
  const share = topScore / total;
  const volume = Math.min(1, topScore / 6);
  return {
    category: top,
    confidence: Math.round(share * volume * 100) / 100,
    needsOrgContext: ORG_CONTEXT_SIGNALS.some((sig) => hasTerm(t, sig)),
    sensitivityWarning: SENSITIVE_SIGNALS.some((sig) => hasTerm(t, sig)),
    matched: [...new Set(matched)].slice(0, 6),
  };
}

// ── Scoring ──────────────────────────────────────────────────────────────────

/** Below this, calling something a recommendation would be dishonest. */
const POOR_FIT_THRESHOLD = 55;
/** Enough observed attempts for adoption evidence to outrank the static profile. */
const EVIDENCE_MIN_ATTEMPTS = 4;

function evidenceFor(
  evidence: ToolCategoryEvidence[] | undefined,
  slug: ToolSlug,
  category: TaskCategory,
): ToolCategoryEvidence | null {
  return evidence?.find((e) => e.slug === slug && e.category === category) ?? null;
}

function scoreTool(
  tool: ToolProfile,
  org: OrgTool,
  cls: Classification,
  input: RoutingInput,
): Recommendation {
  const reasons: string[] = [];
  let score = tool.strengths[cls.category];

  reasons.push(`Rated ${score}/100 for ${cls.category.replace("-", " ")} work in the catalog.`);

  // Grounding is the decisive factor when the task needs company context.
  // Getting this wrong is what produces copy-paste workflows and, from there,
  // pasted-into-personal-account workflows.
  if (cls.needsOrgContext) {
    if (tool.groundedInOrgData) {
      score += 18;
      reasons.push(`Reaches your own content (${tool.groundingScope}), so nothing has to be pasted in.`);
    } else {
      score -= 22;
      reasons.push("Cannot see company content, so this task would mean pasting material in by hand.");
    }
  }

  // Observed adoption overrides the catalog's opinion once there is enough of it.
  const ev = evidenceFor(input.evidence, tool.slug, cls.category);
  let observedAdoption: Recommendation["observedAdoption"] = null;
  if (ev && ev.attempts >= EVIDENCE_MIN_ATTEMPTS) {
    const rate = ev.adopted / ev.attempts;
    observedAdoption = { rate: Math.round(rate * 100), attempts: ev.attempts };
    // Centred on 0.5: proven use lifts, proven abandonment sinks.
    const delta = Math.round((rate - 0.5) * 40);
    score += delta;
    reasons.push(
      delta >= 0
        ? `Colleagues adopted this for similar tasks ${observedAdoption.rate}% of the time (${ev.attempts} attempts).`
        : `Colleagues abandoned this for similar tasks — only ${observedAdoption.rate}% stuck (${ev.attempts} attempts).`,
    );
  }

  // A tool nobody can reach is not a recommendation.
  if (org.seats === 0) {
    score -= 100;
    reasons.push("No seats licensed.");
  }

  return {
    slug: tool.slug,
    name: tool.name,
    vendor: tool.vendor,
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
    caveat: tool.weakFor,
    surfaces: tool.surfaces,
    groundedInOrgData: tool.groundedInOrgData,
    observedAdoption,
  };
}

// ── Route ────────────────────────────────────────────────────────────────────

export function route(input: RoutingInput): RoutingResult {
  const cls = classify(input.task);
  const restricted = RESTRICTED.includes(input.sensitivity);

  const excluded: RoutingResult["excluded"] = [];
  const candidates: Recommendation[] = [];

  for (const org of input.stack) {
    const tool = TOOL_BY_SLUG[org.slug];
    if (!tool) continue;

    // Policy gate comes before scoring: an unapproved tool is not a weaker
    // option for confidential material, it is not an option.
    if (restricted && !org.approvedForSensitive) {
      excluded.push({
        slug: tool.slug,
        name: tool.name,
        reason: `Not cleared for ${input.sensitivity === "personal-data" ? "personal data" : "confidential material"}.`,
      });
      continue;
    }
    if (org.seats === 0) {
      excluded.push({ slug: tool.slug, name: tool.name, reason: "No seats licensed." });
      continue;
    }
    candidates.push(scoreTool(tool, org, cls, input));
  }

  candidates.sort((a, b) => b.score - a.score);
  const primary = candidates[0] ?? null;
  const alternates = candidates.slice(1, 4);

  // ── Gap detection: the honest part ─────────────────────────────────────────
  let gap: StackGap | null = null;

  if (!primary) {
    gap = restricted
      ? {
          kind: "blocked-by-policy",
          headline: "Nothing in your stack is cleared for this material.",
          detail: `Every licensed tool was excluded because the task involves ${
            input.sensitivity === "personal-data" ? "personal data" : "confidential material"
          }.`,
          remedy:
            "Either get one existing tool cleared for this data class, or handle this task without AI. Do not route it to a personal account.",
        }
      : {
          kind: "no-tool-licensed",
          headline: "No licensed tool covers this.",
          detail: "Your stack has nothing suitable for this kind of work.",
          remedy: "Record what you would use instead. Repeated gaps here are the evidence a procurement case is built from.",
        };
  } else if (primary.score < POOR_FIT_THRESHOLD) {
    // The best available option is genuinely weak. Say so — a confident-sounding
    // bad recommendation is how abandonment and shadow use get manufactured.
    const bestInMarket = [...CATALOG]
      .filter((t) => !input.stack.some((s) => s.slug === t.slug))
      .sort((a, b) => b.strengths[cls.category] - a.strengths[cls.category])[0];

    gap = {
      kind: "poor-fit",
      headline: `Your stack covers this weakly — ${primary.name} is the best available at ${primary.score}/100.`,
      detail: `${primary.name} is what you have, not what this task wants. ${primary.caveat ?? ""}`.trim(),
      remedy: bestInMarket
        ? `${bestInMarket.name} scores ${bestInMarket.strengths[cls.category]}/100 here and is not licensed. If this task recurs, that is a procurement question, not a training one.`
        : "If this task recurs, treat it as a procurement question rather than a training one.",
    };
  }

  return {
    category: cls.category,
    categoryConfidence: cls.confidence,
    needsOrgContext: cls.needsOrgContext,
    sensitivity: input.sensitivity,
    primary,
    alternates,
    excluded,
    gap,
  };
}

// ── Stack analysis ───────────────────────────────────────────────────────────

/** Two tools overlap when they are both strong in the same categories. */
export type Overlap = {
  a: ToolSlug;
  b: ToolSlug;
  aName: string;
  bName: string;
  categories: TaskCategory[];
  /** Combined annual cost of the pair, EUR. */
  combinedAnnualEur: number;
};

/**
 * Find redundant coverage in a stack. Zylo reports an average of seven redundant
 * applications per organisation; in AI stacks the redundancy is usually invisible
 * because the tools have different names and the same job.
 */
export function findOverlaps(stack: OrgTool[], strongAt = 75): Overlap[] {
  const out: Overlap[] = [];
  for (let i = 0; i < stack.length; i++) {
    for (let j = i + 1; j < stack.length; j++) {
      const a = TOOL_BY_SLUG[stack[i].slug];
      const b = TOOL_BY_SLUG[stack[j].slug];
      if (!a || !b) continue;
      const categories = (Object.keys(a.strengths) as TaskCategory[]).filter(
        (c) => a.strengths[c] >= strongAt && b.strengths[c] >= strongAt,
      );
      if (categories.length >= 2) {
        out.push({
          a: a.slug,
          b: b.slug,
          aName: a.name,
          bName: b.name,
          categories,
          combinedAnnualEur:
            (stack[i].seats * stack[i].monthlyPriceEur + stack[j].seats * stack[j].monthlyPriceEur) * 12,
        });
      }
    }
  }
  return out.sort((x, y) => y.categories.length - x.categories.length);
}

/**
 * Categories the licensed stack does not actually serve — the procurement gaps.
 *
 * "Licensed" is not the same as "available", and conflating them is how coverage
 * gets overstated. Two corrections applied here:
 *
 *   * Seat reach. A tool licensed to 2,000 people in an 8,800-person company
 *     covers that category for 23% of the company and nobody else. Pass
 *     `headcount` and a category only counts as covered when a capable tool is
 *     within reach of a meaningful share of staff.
 *   * Policy. A tool not cleared for confidential or personal data does not
 *     cover sensitive work in that category, however capable it is. Pass
 *     `requireApproved` when assessing coverage for sensitive tasks.
 *
 * Both corrections reliably reveal gaps that a naive check calls covered, and
 * those gaps are exactly where shadow AI turns up.
 */
export function findCoverageGaps(
  stack: OrgTool[],
  opts: { adequateAt?: number; headcount?: number; minSeatShare?: number; requireApproved?: boolean } = {},
): TaskCategory[] {
  const { adequateAt = 70, headcount, minSeatShare = 0.4, requireApproved = false } = opts;

  const reachable = stack.filter((s) => {
    if (s.seats <= 0) return false;
    if (requireApproved && !s.approvedForSensitive) return false;
    if (headcount && headcount > 0 && s.seats / headcount < minSeatShare) return false;
    return true;
  });

  const tools = reachable.map((s) => TOOL_BY_SLUG[s.slug]).filter(Boolean);
  return (Object.keys(SIGNALS) as TaskCategory[]).filter(
    (c) => !tools.some((t) => t.strengths[c] >= adequateAt),
  );
}
