import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { demoAnalyze } from "@/lib/demo";
import type { Analysis } from "@/lib/types";

export const runtime = "nodejs";

const MODEL = process.env.ADOPT_MODEL || "claude-sonnet-4-6";

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
  try {
    const body = await req.json();
    task = (body?.task || "").toString().trim();
  } catch {
    /* ignore */
  }

  if (!task) {
    return NextResponse.json({ error: "Please describe a task." }, { status: 400 });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    // Free demo mode — no API key configured.
    return NextResponse.json(demoAnalyze(task));
  }

  try {
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM,
      messages: [{ role: "user", content: `Task: ${task}` }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = extractJson(text);
    if (!parsed) {
      return NextResponse.json({ ...demoAnalyze(task), demo: true });
    }
    return NextResponse.json({ ...parsed, demo: false });
  } catch (err) {
    // Any API failure (quota, network, bad key) → graceful demo fallback.
    console.error("Anthropic call failed, falling back to demo:", err);
    return NextResponse.json({ ...demoAnalyze(task), demo: true });
  }
}
