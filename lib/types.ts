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
  /** True when produced by the offline demo engine (no API key). */
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
