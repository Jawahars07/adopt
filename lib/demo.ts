import type { Analysis } from "./types";

/**
 * Offline demo engine.
 *
 * Produces a structured, believable adoption analysis WITHOUT calling any model,
 * so the app works on a fresh deploy with no ANTHROPIC_API_KEY. It is a heuristic
 * — not a substitute for the real model — and every result is flagged demo: true.
 */

const GENAI_SIGNALS: { kw: string[]; tool: string; tip: string }[] = [
  { kw: ["email", "reply", "inbox", "outlook"], tool: "Microsoft 365 Copilot in Outlook", tip: "drafting and summarising email threads" },
  { kw: ["meeting", "notes", "minutes", "teams", "transcript", "recap"], tool: "Copilot in Microsoft Teams", tip: "meeting recaps and action items" },
  { kw: ["slide", "deck", "presentation", "powerpoint", "ppt"], tool: "Copilot in PowerPoint", tip: "turning a brief or doc into a first-draft deck" },
  { kw: ["excel", "spreadsheet", "data", "formula", "table", "report", "dashboard"], tool: "Copilot in Excel", tip: "analysing data and explaining formulas" },
  { kw: ["document", "word", "draft", "write", "summary", "summarise", "policy"], tool: "Copilot in Word", tip: "drafting and rewriting documents" },
  { kw: ["search", "find", "knowledge", "sharepoint", "intranet", "policy", "where is"], tool: "Microsoft 365 Copilot (work)", tip: "grounded search across your tenant" },
  { kw: ["repetitive", "workflow", "agent", "automate", "process", "approval", "ticket"], tool: "Copilot Studio agent", tip: "a low-code agent for a repeatable process" },
];

const SENSITIVE = ["salary", "payroll", "legal", "contract", "medical", "confidential", "password", "personal data", "gdpr"];

function pick<T>(arr: T[], n: number): T[] {
  return arr.slice(0, n);
}

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function demoAnalyze(task: string): Analysis {
  const t = task.toLowerCase();

  // Match the strongest GenAI signal.
  let match = GENAI_SIGNALS.find((g) => g.kw.some((k) => t.includes(k)));
  const matched = !!match;
  if (!match) match = { kw: [], tool: "Microsoft 365 Copilot (chat)", tip: "general drafting and Q&A" };

  // Heuristic scoring.
  const wordCount = t.split(/\s+/).filter(Boolean).length;
  const repetitive = /(every|daily|weekly|each|recurring|routine|always|regularly)/.test(t);
  const sensitive = SENSITIVE.some((s) => t.includes(s));

  let fit = 55;
  if (matched) fit += 22;
  if (repetitive) fit += 12;
  if (wordCount >= 6) fit += 6;
  if (sensitive) fit -= 25;
  fit = Math.max(15, Math.min(96, fit));

  const impact: Analysis["impact"] = repetitive ? "high" : matched ? "medium" : "low";
  const effort: Analysis["effort"] = match.tool.includes("Studio") ? "high" : matched ? "low" : "medium";

  const verdict = sensitive
    ? "Proceed carefully — sensitive data is involved; confirm data-handling rules before adopting."
    : fit >= 70
      ? "Strong fit — a good candidate to adopt now and share with the team."
      : fit >= 50
        ? "Moderate fit — worth piloting with one user before rolling out."
        : "Weak fit — GenAI may not save enough time here yet.";

  const steps = [
    `Open ${match.tool}.`,
    `Start from a real example of this task so you can compare the output to what you'd normally produce.`,
    `Paste the prompt below and replace the [bracketed] parts with your own details.`,
    `Review the result critically — edit anything that's wrong, vague, or off-tone. You stay accountable for the output.`,
    repetitive
      ? `Once it works, save the prompt as a reusable template and share it with your team so everyone adopts the same pattern.`
      : `If it helped, note it so colleagues with the same task can reuse it.`,
  ];
  if (sensitive) {
    steps.splice(1, 0, `Check your organisation's data rules first — avoid pasting confidential or personal data into tools not approved for it.`);
  }

  const prompt = `You are helping me with the following task: ${titleCase(task.trim())}.

Context:
- My role: [your role]
- What I'm working with: [paste the document, data, or thread here]
- Audience / tone: [who this is for]

Please:
1. Do the task above using the context I provided.
2. Keep it concise and ready to use.
3. Flag anything you were unsure about so I can check it.`;

  const cautions = pick(
    [
      "Always review the output — GenAI can sound confident while being wrong.",
      sensitive
        ? "This task may involve sensitive data — only use tools approved for it."
        : "Don't paste confidential or personal data into unapproved tools.",
      match.tool.includes("Studio")
        ? "A Copilot Studio agent needs a clear, repeatable process and an owner to maintain it."
        : "Save prompts that work so the whole team adopts the same approach.",
    ],
    3,
  );

  return {
    title: titleCase(task.trim()).slice(0, 70),
    fitScore: fit,
    impact,
    effort,
    recommendedTool: match.tool,
    verdict,
    steps,
    prompt,
    cautions,
    demo: true,
  };
}
