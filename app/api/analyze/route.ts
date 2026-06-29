import { NextResponse } from "next/server";
import { complete, isDemo } from "@/lib/llm";
import { demoAnalyze } from "@/lib/demo";
import { SEED_PLAYBOOK, retrieve } from "@/lib/playbook";
import type { Analysis, PlaybookEntry } from "@/lib/types";

export const runtime = "nodejs";

const SYSTEM = `You are "Adopt", a Digital Workplace & GenAI adoption assistant for a large company.
A colleague describes an everyday work task. You qualify it as a GenAI / Microsoft 365 Copilot use case
and produce a practical adoption package a NON-TECHNICAL person can follow.

Be honest: if GenAI is a poor fit, say so and score it low. If the task involves sensitive or personal
data, lower the score and add a clear caution. Recommend the most specific Microsoft 365 Copilot surface
(Outlook, Teams, Word, Excel, PowerPoint, Copilot chat) or a Copilot Studio agent when the task is a
repeatable process.

Respond with ONLY a JSON object, no markdown, matching exactly:
{
  "title": string,                       // <= 70 chars
  "fitScore": number,                    // 0-100, how well GenAI fits
  "impact": "high" | "medium" | "low",
  "effort": "low" | "medium" | "high",
  "recommendedTool": string,
  "verdict": string,                     // one honest sentence
  "steps": string[],                     // 4-6 plain-language adoption steps
  "prompt": string,                      // a ready-to-paste prompt with [bracketed] placeholders
  "cautions": string[]                   // 2-3 short cautions
}`;

function extractJson(text: string): Analysis | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Analysis;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let task = "";
  let learned: PlaybookEntry[] = [];
  try {
    const body = await req.json();
    task = (body?.task || "").toString().trim();
    // The client passes its accumulated, feedback-ranked entries so retrieval
    // improves as adoption data grows (the flywheel). Seed entries always apply.
    if (Array.isArray(body?.playbook)) learned = body.playbook as PlaybookEntry[];
  } catch {
    /* ignore */
  }

  if (!task) {
    return NextResponse.json({ error: "Please describe a task." }, { status: 400 });
  }

  // Feedback-weighted retrieval over the Living Playbook.
  const relatedProven = retrieve(task, [...learned, ...SEED_PLAYBOOK], 2);

  // No model configured → run fully on the offline heuristic. $0, no dependency.
  if (isDemo()) {
    return NextResponse.json({ ...demoAnalyze(task), relatedProven });
  }

  try {
    // Ground the model in what has actually been adopted (retrieval-augmented).
    const provenContext = relatedProven.length
      ? `\n\nProven plays for similar tasks (prefer reusing these if they fit):\n${relatedProven
          .map((p) => `- "${p.pattern}" → ${p.recommendedTool}`)
          .join("\n")}`
      : "";
    const text = await complete({ system: SYSTEM, user: `Task: ${task}${provenContext}`, maxTokens: 1500 });
    const parsed = extractJson(text);
    if (!parsed) {
      return NextResponse.json({ ...demoAnalyze(task), relatedProven, demo: true });
    }
    return NextResponse.json({ ...parsed, relatedProven, demo: false });
  } catch (err) {
    // Any provider failure (down, quota, bad config) → graceful heuristic fallback.
    console.error("LLM call failed, falling back to heuristic:", err);
    return NextResponse.json({ ...demoAnalyze(task), relatedProven, demo: true });
  }
}
