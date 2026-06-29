export type Analysis = {
  /** Short title for the use case, derived from the task. */
  title: string;
  /** 0-100: how well-suited this task is to GenAI / Copilot. */
  fitScore: number;
  /** "high" | "medium" | "low" business impact. */
  impact: "high" | "medium" | "low";
  /** "low" | "medium" | "high" effort to adopt. */
  effort: "low" | "medium" | "high";
  /** Which Microsoft 365 Copilot surface or GenAI tool fits best. */
  recommendedTool: string;
  /** One-line verdict on whether to adopt now. */
  verdict: string;
  /** Step-by-step adoption guide for a non-technical user. */
  steps: string[];
  /** A ready-to-paste prompt the user can drop into Copilot / Claude. */
  prompt: string;
  /** Common pitfalls / things to check. */
  cautions: string[];
  /** Proven, feedback-ranked playbook entries similar to this task (the flywheel). */
  relatedProven?: ProvenMatch[];
  /** True when produced by the offline demo engine (no API key). */
  demo?: boolean;
};

/** A proven entry surfaced from the Living Playbook for a new task. */
export type ProvenMatch = {
  id: string;
  pattern: string;
  recommendedTool: string;
  prompt: string;
  adoptionRate: number; // 0-100, % of times this was actually adopted
  avgRating: number; // 1-5
  sampleSize: number; // how many times it's been used
};

/** A learned entry in the Living Playbook — proven prompts ranked by adoption. */
export type PlaybookEntry = {
  id: string;
  pattern: string;
  keywords: string[];
  recommendedTool: string;
  prompt: string;
  adoptedCount: number;
  totalCount: number;
  avgRating: number;
  /** How many ratings contributed to avgRating (for running averages). */
  ratingCount?: number;
  origin: "seed" | "learned";
  updatedAt: number;
};

/** Result of the evaluator-optimizer self-improvement loop. */
export type Improvement = {
  critique: string;
  improvedPrompt: string;
  changes: string[];
  demo?: boolean;
};

export type StoredUseCase = Analysis & {
  id: string;
  task: string;
  createdAt: number;
  /** Feedback captured after the user tries it. */
  adopted?: boolean;
  rating?: number; // 1-5
  painPoint?: string;
};
