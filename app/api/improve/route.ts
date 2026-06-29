import { NextResponse } from "next/server";
import { complete, isDemo } from "@/lib/llm";
import type { Improvement } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Evaluator–Optimizer loop.
 *
 * Given a prompt that underperformed (low rating + a reported pain point), an
 * evaluator critiques WHY it fell short, then an optimizer rewrites it. This is
 * the "works on its own" mechanism: the system improves its own outputs from
 * real feedback instead of waiting for a human to re-prompt.
 */
const SYSTEM = `You improve GenAI adoption prompts using real user feedback.
You are given a prompt that underperformed, its rating (1-5), and the user's pain point.

Act as an evaluator THEN an optimizer:
1. Critique: in one or two sentences, diagnose WHY it underperformed given the feedback.
2. Rewrite: produce a clearly better prompt that fixes the diagnosed problem. Keep
   [bracketed] placeholders for user input. Make it specific, structured, and safe.
3. List the concrete changes you made.

Respond with ONLY JSON, no markdown:
{ "critique": string, "improvedPrompt": string, "changes": string[] }`;

function demoImprove(prompt: string, painPoint: string): Improvement {
  const pain = painPoint.trim();
  const critique = pain
    ? `The prompt was too open-ended for "${pain}" — it didn't constrain the format or ask the model to flag uncertainty, so output needed heavy editing.`
    : "The prompt was too open-ended — no output format and no instruction to flag uncertainty, so results were inconsistent.";
  const improvedPrompt = `${prompt.trim()}

Make the output easier to use:
- Return it as a short, structured format (bullets or a table) I can paste directly.
- Keep the tone professional and concise.
- At the end, list anything you were unsure about so I can check it.
${pain ? `- Specifically address: ${pain}.` : ""}`;
  return {
    critique,
    improvedPrompt,
    changes: [
      "Added an explicit output format so results are consistent",
      "Asked the model to flag uncertainty instead of guessing",
      pain ? `Targeted the reported pain point: ${pain}` : "Tightened tone and length",
    ].filter(Boolean),
    demo: true,
  };
}

function extractJson(text: string): Improvement | null {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1) return null;
  try {
    return JSON.parse(text.slice(s, e + 1)) as Improvement;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let prompt = "";
  let painPoint = "";
  let rating = 0;
  try {
    const body = await req.json();
    prompt = (body?.prompt || "").toString();
    painPoint = (body?.painPoint || "").toString();
    rating = Number(body?.rating) || 0;
  } catch {
    /* ignore */
  }

  if (!prompt.trim()) {
    return NextResponse.json({ error: "Nothing to improve." }, { status: 400 });
  }

  // No model configured → heuristic improvement. $0, no dependency.
  if (isDemo()) {
    return NextResponse.json(demoImprove(prompt, painPoint));
  }

  try {
    const text = await complete({
      system: SYSTEM,
      user: `Underperforming prompt:\n${prompt}\n\nRating: ${rating}/5\nPain point: ${painPoint || "(none given)"}`,
      maxTokens: 1200,
    });
    const parsed = extractJson(text);
    if (!parsed) return NextResponse.json({ ...demoImprove(prompt, painPoint), demo: true });
    return NextResponse.json({ ...parsed, demo: false });
  } catch (err) {
    console.error("Improve call failed, falling back to heuristic:", err);
    return NextResponse.json({ ...demoImprove(prompt, painPoint), demo: true });
  }
}
