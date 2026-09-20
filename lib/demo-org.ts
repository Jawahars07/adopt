/**
 * The demo organisation.
 *
 * Deterministic synthetic data for a plausible mid-size European company, so
 * every surface is populated and the analytics mean something on first open. An
 * empty control plane demonstrates nothing.
 *
 * HONESTY: this organisation does not exist. `is_demo` is true on the row, and
 * every surface that renders it carries a visible marker. These numbers are
 * never to be presented as measured telemetry. (CONVENTIONS.md)
 *
 * The data is shaped to carry a real narrative rather than noise, because the
 * narrative IS the product demonstration:
 *
 *   1. Copilot is genuinely working for mail and meetings, and quietly failing
 *      for document drafting — where Claude is winning at a fraction of the seats.
 *      => a MIGRATE verdict, which no usage dashboard can produce.
 *   2. ChatGPT and Claude overlap across five categories at combined six-figure
 *      annual cost. => a CONSOLIDATE question.
 *   3. Gemini was bought by one department, is barely touched, and everything it
 *      does is already covered. => a CUT verdict with a euro figure.
 *   4. The only research-capable tool Meridian owns is not cleared for
 *      confidential material, so its most sensitive research has nowhere
 *      legitimate to go and leaks to personal accounts. => the punchline:
 *      shadow AI here is not an indiscipline problem, it is a gap the
 *      organisation created and can close.
 */

import type { TaskCategory, ToolSlug } from "./catalog";

// ── Deterministic RNG ────────────────────────────────────────────────────────
// Seeded so the demo is identical on every machine and every redeploy. A demo
// whose numbers move between screenshots is not a demo, it is a liability.

function mulberry32(seed: number) {
  return function rand() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260920);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const chance = (p: number) => rand() < p;
const intBetween = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

// ── The organisation ─────────────────────────────────────────────────────────

export const DEMO_ORG = {
  id: "org-meridian",
  name: "Meridian Group",
  slug: "meridian",
  isDemo: true,
  headcount: 8800,
  blurb: "European industrial services group. Synthetic organisation used to demonstrate Adopt.",
};

export const DEPARTMENTS = [
  "Commercial", "Operations", "Finance", "Legal", "Engineering", "People", "Marketing",
] as const;
export type Department = (typeof DEPARTMENTS)[number];

/** The stack, with the commercial terms Meridian holds it on. */
export const DEMO_STACK: {
  slug: ToolSlug;
  seats: number;
  approvedForSensitive: boolean;
  monthlyPriceEur: number;
  activatedOn: string;
}[] = [
  { slug: "copilot-m365", seats: 4200, approvedForSensitive: true, monthlyPriceEur: 28, activatedOn: "2025-11-01" },
  { slug: "chatgpt-enterprise", seats: 2000, approvedForSensitive: false, monthlyPriceEur: 25, activatedOn: "2026-01-15" },
  { slug: "claude-enterprise", seats: 900, approvedForSensitive: true, monthlyPriceEur: 28, activatedOn: "2026-03-01" },
  { slug: "gemini-workspace", seats: 1100, approvedForSensitive: false, monthlyPriceEur: 22, activatedOn: "2026-02-01" },
  { slug: "slack-ai", seats: 3400, approvedForSensitive: false, monthlyPriceEur: 9, activatedOn: "2025-09-01" },
  { slug: "notion-ai", seats: 600, approvedForSensitive: false, monthlyPriceEur: 10, activatedOn: "2026-04-01" },
  { slug: "github-copilot", seats: 420, approvedForSensitive: true, monthlyPriceEur: 19, activatedOn: "2025-06-01" },
  { slug: "cursor", seats: 180, approvedForSensitive: true, monthlyPriceEur: 20, activatedOn: "2026-05-01" },
];
// Deliberately absent: Glean and Perplexity. That absence is the coverage gap
// the shadow-AI data lands in.

/**
 * Vendor-reported seat activity. Percentages are the story:
 * Copilot healthy, ChatGPT middling, Claude excellent on few seats, Gemini dead,
 * Cursor redundant beside GitHub Copilot.
 *
 * Anchored near published benchmarks — roughly 36% of ChatGPT Enterprise seats
 * unused, about 32% for GitHub Copilot, M365 Copilot near 60% utilisation — so
 * the demo sits in a realistic range rather than a flattering one.
 */
const ACTIVE_RATE: Record<ToolSlug, number> = {
  "copilot-m365": 0.61,
  "chatgpt-enterprise": 0.58,
  "claude-enterprise": 0.88,
  "gemini-workspace": 0.19,
  "slack-ai": 0.72,
  "notion-ai": 0.44,
  "github-copilot": 0.68,
  cursor: 0.37,
  glean: 0,
  "perplexity-enterprise": 0,
};

export type UsageRow = {
  toolSlug: ToolSlug;
  month: string;
  licensedSeats: number;
  activeSeats: number;
};

/** Six months of seat activity, with a mild trend per tool. */
export function buildUsage(months = 6): UsageRow[] {
  const rows: UsageRow[] = [];
  const now = new Date("2026-09-01T00:00:00Z");
  for (const tool of DEMO_STACK) {
    const target = ACTIVE_RATE[tool.slug];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCMonth(d.getUTCMonth() - i);
      // Newer tools ramp; Gemini decays after its launch spike.
      const age = months - i;
      const ramp = tool.slug === "gemini-workspace"
        ? Math.max(0.35, 1.5 - age * 0.18)
        : Math.min(1, 0.55 + age * 0.09);
      const noise = 1 + (rand() - 0.5) * 0.08;
      const rate = Math.max(0, Math.min(1, target * ramp * noise));
      rows.push({
        toolSlug: tool.slug,
        month: d.toISOString().slice(0, 10),
        licensedSeats: tool.seats,
        activeSeats: Math.round(tool.seats * rate),
      });
    }
  }
  return rows;
}

// ── Task corpus ──────────────────────────────────────────────────────────────

const TASKS: Record<TaskCategory, string[]> = {
  email: [
    "Summarise this long client email thread before I reply",
    "Draft a reply to the supplier chasing the delayed order",
    "Triage my inbox after two weeks of leave and list what needs an answer",
    "Turn this thread into a short update for my manager",
  ],
  meetings: [
    "Turn the weekly ops meeting transcript into action items with owners",
    "Recap the steering committee call for people who missed it",
    "Pull decisions and open questions out of the project sync notes",
    "Summarise the customer call and flag anything we committed to",
  ],
  docs: [
    "Draft the first version of the remote working policy",
    "Write the quarterly business review narrative from these figures",
    "Turn these notes into a two-page proposal for the client",
    "Rewrite the onboarding guide so a new starter can follow it",
    "Draft the incident post-mortem from the timeline",
  ],
  slides: [
    "Build a six-slide deck from this project brief",
    "Turn the quarterly results into an executive presentation",
    "Make a short pitch deck for the internal funding request",
  ],
  spreadsheet: [
    "Explain what this budget formula is doing and whether it is right",
    "Suggest the three most useful pivots for this sales data",
    "Build a formula to reconcile these two exports",
  ],
  "knowledge-search": [
    "Where is the current travel expense policy",
    "Find the signed version of the Nordbau contract",
    "Which internal team owns the customer data retention process",
    "What did we agree with this supplier last year",
  ],
  code: [
    "Refactor this service and add unit tests",
    "Work out why this integration test fails only in CI",
    "Review this pull request for security problems",
  ],
  research: [
    "Competitor benchmark of the European packaging market with sources",
    "What are the main regulatory changes coming for our sector",
    "Summarise how three competitors price this service line",
    "Build a market sizing for the Benelux expansion case",
    "Find recent analyst commentary on our largest customer",
  ],
  "long-doc": [
    "Read this 90-page supplier contract and extract our obligations",
    "Pull the risk factors out of this annual report",
    "Compare these two versions of the framework agreement",
  ],
  automation: [
    "Every week I compile the same status report from four systems",
    "Automate the monthly supplier performance summary",
    "This approval routine happens twenty times a month and is identical",
  ],
};

/**
 * How Meridian's tools actually perform per category, as observed. Diverges from
 * the catalog on purpose — that divergence is what the Ledger exists to surface.
 * Values are adoption probability.
 */
const OBSERVED: Partial<Record<ToolSlug, Partial<Record<TaskCategory, number>>>> = {
  "copilot-m365": {
    email: 0.84, meetings: 0.81, "knowledge-search": 0.62,
    docs: 0.24,        // the migrate story: Copilot is losing document work
    slides: 0.55, spreadsheet: 0.58, automation: 0.41,
  },
  "claude-enterprise": {
    docs: 0.89, "long-doc": 0.92, research: 0.7, code: 0.8, automation: 0.6,
  },
  "chatgpt-enterprise": {
    docs: 0.62, research: 0.58, code: 0.66, spreadsheet: 0.55, "long-doc": 0.6, automation: 0.55,
  },
  "gemini-workspace": {
    email: 0.22, docs: 0.18, spreadsheet: 0.26, meetings: 0.2, slides: 0.21,
  },
  "slack-ai": { meetings: 0.66, "knowledge-search": 0.6 },
  "notion-ai": { meetings: 0.54, docs: 0.46, "knowledge-search": 0.5 },
  "github-copilot": { code: 0.87 },
  cursor: { code: 0.72 },
};

const BLOCKERS_BY_CATEGORY: Partial<Record<TaskCategory, string[]>> = {
  docs: ["quality", "quality", "quality", "workflow"],
  email: ["workflow", "quality"],
  meetings: ["quality", "workflow"],
  research: ["trust", "quality"],
  spreadsheet: ["trust", "quality"],
  "knowledge-search": ["trust", "workflow"],
  slides: ["quality", "speed"],
  code: ["quality", "workflow"],
  "long-doc": ["data", "trust"],
  automation: ["workflow", "speed"],
};

const DEPT_BIAS: Record<Department, TaskCategory[]> = {
  Commercial: ["email", "slides", "research", "meetings"],
  Operations: ["meetings", "automation", "spreadsheet", "knowledge-search"],
  Finance: ["spreadsheet", "docs", "long-doc", "automation"],
  Legal: ["long-doc", "docs", "knowledge-search"],
  Engineering: ["code", "docs", "meetings"],
  People: ["docs", "knowledge-search", "email"],
  Marketing: ["docs", "slides", "research", "email"],
};

// ── Generated records ────────────────────────────────────────────────────────

export type DemoUseCase = {
  id: string;
  task: string;
  category: TaskCategory;
  sensitivity: string;
  department: Department;
  routedTool: ToolSlug | null;
  routedScore: number | null;
  needsOrgContext: boolean;
  gapKind: string | null;
  createdAt: string;
  feedback: { adopted: boolean; rating: number; blocker: string | null } | null;
};

export type DemoShadowEvent = {
  id: string;
  useCaseId: string | null;
  category: TaskCategory;
  toolUsed: string;
  reason: string;
  sensitivity: string;
  department: Department;
  createdAt: string;
  /** The gap the router raised, when it raised one. */
  gapKind: string | null;
};

/**
 * Where Meridian's work actually goes.
 *
 * Deliberately not uniform. Legal and Finance adopted Claude early and send
 * their document work there; everyone else still defaults to Copilot, where it
 * is quietly failing. That split is what makes the MIGRATE verdict computable —
 * with uniform routing there is no comparison to draw, and the Ledger could only
 * ever say "this is not working" rather than "you already own the fix".
 */
function routeFor(category: TaskCategory, department: Department): ToolSlug | null {
  switch (category) {
    case "docs":
      // The early-adopter departments went to Claude and stayed.
      return department === "Legal" || department === "Finance" || chance(0.15)
        ? "claude-enterprise"
        : "copilot-m365";
    case "meetings":
      return chance(0.2) ? "slack-ai" : chance(0.1) ? "notion-ai" : "copilot-m365";
    case "knowledge-search":
      return chance(0.3) ? "slack-ai" : "copilot-m365";
    case "code":
      // Cursor was bought by one squad on top of GitHub Copilot.
      return chance(0.3) ? "cursor" : "github-copilot";
    case "spreadsheet":
      return chance(0.25) ? "gemini-workspace" : "copilot-m365";
    case "slides":
      return chance(0.2) ? "gemini-workspace" : "copilot-m365";
    case "email":
      return chance(0.15) ? "gemini-workspace" : "copilot-m365";
    case "long-doc":
      return "claude-enterprise";
    case "automation":
      return "chatgpt-enterprise";
    case "research":
      // ChatGPT is the only research-capable tool and it is NOT cleared for
      // confidential material. Sensitive research therefore has nowhere to go.
      return "chatgpt-enterprise";
    default:
      return null;
  }
}

const SHADOW_TOOLS_FOR_RESEARCH = [
  "Perplexity (personal)", "ChatGPT (personal account)", "Claude (personal account)",
  "Perplexity (personal)", "Gemini (personal account)",
];

function isoDaysAgo(days: number): string {
  const d = new Date("2026-09-20T09:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(intBetween(8, 18), intBetween(0, 59), 0, 0);
  return d.toISOString();
}

export function buildUseCases(count = 240): {
  useCases: DemoUseCase[];
  shadowEvents: DemoShadowEvent[];
} {
  const useCases: DemoUseCase[] = [];
  const shadowEvents: DemoShadowEvent[] = [];

  for (let i = 0; i < count; i++) {
    const department = pick(DEPARTMENTS);
    const category = chance(0.75) ? pick(DEPT_BIAS[department]) : pick(Object.keys(TASKS) as TaskCategory[]);
    const task = pick(TASKS[category]);
    const createdAt = isoDaysAgo(intBetween(0, 89));
    const id = `uc-${String(i + 1).padStart(4, "0")}`;

    const sensitivity =
      category === "long-doc" ? (chance(0.5) ? "confidential" : "internal")
      : department === "People" ? (chance(0.45) ? "personal-data" : "internal")
      : department === "Legal" ? (chance(0.5) ? "confidential" : "internal")
      : chance(0.12) ? "confidential" : "internal";

    const routedTool = routeFor(category, department);

    // The policy gate: ChatGPT is the only research-capable tool Meridian owns
    // and it is not cleared for confidential material, so the most sensitive
    // research has nowhere legitimate to go. People do it anyway.
    const blockedByPolicy =
      routedTool === "chatgpt-enterprise" &&
      (sensitivity === "confidential" || sensitivity === "personal-data");

    if (!routedTool || blockedByPolicy) {
      useCases.push({
        id, task, category, sensitivity, department,
        routedTool: null, routedScore: null,
        needsOrgContext: chance(0.3),
        gapKind: blockedByPolicy ? "blocked-by-policy" : "no-tool-licensed",
        createdAt, feedback: null,
      });
      if (chance(0.72)) {
        shadowEvents.push({
          id: `sh-${String(shadowEvents.length + 1).padStart(4, "0")}`,
          useCaseId: id,
          category,
          toolUsed: pick(SHADOW_TOOLS_FOR_RESEARCH),
          reason: blockedByPolicy
            ? "The only capable tool is not cleared for this material"
            : "No licensed tool covered this",
          sensitivity,
          department,
          createdAt,
          gapKind: blockedByPolicy ? "blocked-by-policy" : "no-tool-licensed",
        });
      }
      continue;
    }

    const adoptionP = OBSERVED[routedTool]?.[category] ?? 0.45;
    const adopted = chance(adoptionP);
    const rating = adopted ? intBetween(4, 5) : intBetween(1, 3);
    const blocker = adopted ? null : pick(BLOCKERS_BY_CATEGORY[category] ?? ["quality"]);
    // Most people give feedback in a demo dataset; some never come back.
    const gaveFeedback = chance(0.86);

    useCases.push({
      id, task, category, sensitivity, department,
      routedTool,
      routedScore: intBetween(58, 94),
      needsOrgContext: ["email", "meetings", "knowledge-search"].includes(category) || chance(0.25),
      gapKind: null,
      createdAt,
      feedback: gaveFeedback ? { adopted, rating, blocker } : null,
    });

    // Abandonment sometimes leaks outside the stack too — a smaller, sharper
    // signal than the research gap, and the one a CISO cares about most.
    if (gaveFeedback && !adopted && chance(0.22)) {
      shadowEvents.push({
        id: `sh-${String(shadowEvents.length + 1).padStart(4, "0")}`,
        useCaseId: id,
        category,
        toolUsed: pick(["ChatGPT (personal account)", "Claude (personal account)", "A browser extension"]),
        reason: blocker === "quality" ? "Licensed tool output was not good enough" : "Licensed tool did not fit the workflow",
        sensitivity,
        department,
        createdAt,
        // Routing worked; the tool did not. This is preference-driven leakage,
        // and it must not be counted as a gap the organisation created.
        gapKind: null,
      });
    }
  }

  return { useCases, shadowEvents };
}

/** The whole seeded dataset, built once. */
export function buildDemoDataset() {
  const { useCases, shadowEvents } = buildUseCases();
  return { org: DEMO_ORG, stack: DEMO_STACK, usage: buildUsage(), useCases, shadowEvents };
}
