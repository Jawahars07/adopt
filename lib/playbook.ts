import type { PlaybookEntry, ProvenMatch } from "./types";

/**
 * The Living Playbook — the heart of Adopt's moat.
 *
 * This is NOT a prompt. It is a growing, feedback-ranked memory of which GenAI
 * use cases actually got adopted and how well they were rated. New tasks retrieve
 * the proven entries most similar to them, weighted by real adoption success — so
 * recommendations improve automatically as feedback accumulates (a data flywheel).
 *
 * Retrieval here is transparent keyword-overlap scoring (zero-cost, explainable).
 * The documented upgrade path is vector embeddings + a shared store (Vercel KV /
 * Postgres) to make the flywheel org-wide rather than per-browser.
 */

// ── Seed knowledge: proven entries the playbook ships with ───────────────────
export const SEED_PLAYBOOK: PlaybookEntry[] = [
  {
    id: "seed-meeting-notes",
    pattern: "Turn meeting notes / transcripts into action items",
    keywords: ["meeting", "notes", "minutes", "transcript", "action", "recap", "teams", "follow up"],
    recommendedTool: "Copilot in Microsoft Teams",
    prompt:
      "From the meeting notes below, produce: (1) a 3-bullet summary, (2) a table of action items with owner and due date, (3) any decisions made. Flag anything ambiguous.\n\nNotes:\n[paste notes]",
    adoptedCount: 24,
    totalCount: 27,
    avgRating: 4.7,
    origin: "seed",
    updatedAt: Date.now(),
  },
  {
    id: "seed-email-triage",
    pattern: "Summarise long email threads before replying",
    keywords: ["email", "thread", "inbox", "outlook", "reply", "summarise", "summary"],
    recommendedTool: "Copilot in Outlook",
    prompt:
      "Summarise this email thread in 4 bullets: what's been decided, what's open, who is waiting on me, and a suggested next reply in my voice (concise, professional).\n\nThread:\n[paste thread]",
    adoptedCount: 18,
    totalCount: 22,
    avgRating: 4.5,
    origin: "seed",
    updatedAt: Date.now(),
  },
  {
    id: "seed-slide-draft",
    pattern: "Draft a first-version slide deck from a brief or doc",
    keywords: ["slide", "deck", "presentation", "powerpoint", "ppt", "draft", "brief"],
    recommendedTool: "Copilot in PowerPoint",
    prompt:
      "Turn the brief below into a 6-slide outline: title, problem, solution, proof, plan, ask. For each slide give a headline and 3 bullets. Keep it executive-ready.\n\nBrief:\n[paste brief]",
    adoptedCount: 15,
    totalCount: 21,
    avgRating: 4.2,
    origin: "seed",
    updatedAt: Date.now(),
  },
  {
    id: "seed-excel-analysis",
    pattern: "Analyse a spreadsheet / explain or build a formula",
    keywords: ["excel", "spreadsheet", "data", "formula", "table", "analyse", "report", "pivot"],
    recommendedTool: "Copilot in Excel",
    prompt:
      "Look at the data described below. Suggest the 3 most useful insights, the chart that best shows each, and the exact Excel formula to compute them. Explain each formula in one line.\n\nData:\n[describe columns / paste sample]",
    adoptedCount: 11,
    totalCount: 19,
    avgRating: 4.0,
    origin: "seed",
    updatedAt: Date.now(),
  },
  {
    id: "seed-policy-search",
    pattern: "Find the right policy / document across the company",
    keywords: ["search", "find", "policy", "document", "sharepoint", "intranet", "knowledge", "where"],
    recommendedTool: "Microsoft 365 Copilot (work)",
    prompt:
      "Find the current company policy on [topic]. Give me the answer in 3 bullets, the source document name, and the last-updated date. If there are conflicting versions, say so.",
    adoptedCount: 20,
    totalCount: 23,
    avgRating: 4.6,
    origin: "seed",
    updatedAt: Date.now(),
  },
  {
    id: "seed-repetitive-agent",
    pattern: "Automate a repeatable, multi-step process",
    keywords: ["repetitive", "workflow", "automate", "process", "approval", "ticket", "routine", "every", "agent"],
    recommendedTool: "Copilot Studio agent",
    prompt:
      "Map this recurring process into steps a low-code agent could run: trigger, inputs, the decision rules, and the output. Flag the one step that still needs a human.\n\nProcess:\n[describe the routine]",
    adoptedCount: 7,
    totalCount: 16,
    avgRating: 3.8,
    origin: "seed",
    updatedAt: Date.now(),
  },
];

const STOPWORDS = new Set([
  "the", "a", "an", "to", "of", "and", "or", "my", "me", "i", "for", "in", "on",
  "with", "into", "from", "is", "are", "be", "this", "that", "it", "as", "by",
  "want", "need", "would", "like", "get", "make", "do", "can", "how",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Adoption success: blends how often it was adopted with how it was rated. 0-1. */
export function adoptionScore(e: PlaybookEntry): number {
  const rate = e.totalCount > 0 ? e.adoptedCount / e.totalCount : 0;
  const rating = e.avgRating / 5;
  return 0.6 * rate + 0.4 * rating;
}

/**
 * Retrieve the proven entries most relevant to a task.
 * Relevance = keyword overlap (similarity) boosted by real adoption success.
 */
export function retrieve(task: string, entries: PlaybookEntry[], limit = 2): ProvenMatch[] {
  const taskTokens = new Set(tokenize(task));
  if (taskTokens.size === 0) return [];

  const scored = entries
    .map((e) => {
      const bag = new Set([...e.keywords, ...tokenize(e.pattern)]);
      let overlap = 0;
      taskTokens.forEach((t) => {
        if (bag.has(t)) overlap += 1;
      });
      const similarity = overlap / Math.sqrt(taskTokens.size * bag.size); // cosine-ish
      const score = similarity * (0.5 + adoptionScore(e)); // weight by adoption success
      return { e, similarity, score };
    })
    .filter((x) => x.similarity > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ e }) => ({
    id: e.id,
    pattern: e.pattern,
    recommendedTool: e.recommendedTool,
    prompt: e.prompt,
    adoptionRate: e.totalCount > 0 ? Math.round((e.adoptedCount / e.totalCount) * 100) : 0,
    avgRating: e.avgRating,
    sampleSize: e.totalCount,
    origin: e.origin,
  }));
}
