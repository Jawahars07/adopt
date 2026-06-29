/**
 * Model-agnostic completion layer — Adopt is NOT locked to any single vendor.
 *
 * Pick a provider with the LLM_PROVIDER env var:
 *   - "demo"   (default) → no model at all; the heuristic engine handles everything. $0, offline.
 *   - "ollama"           → a local model via Ollama (free, private, runs on your machine).
 *   - "openai"           → ANY OpenAI-compatible endpoint: Groq (free tier), OpenRouter,
 *                          LM Studio, vLLM, or OpenAI itself. Set LLM_BASE_URL + LLM_API_KEY.
 *   - "anthropic"        → Claude via the Messages API (optional; no SDK dependency).
 *
 * Every provider is called over plain fetch, so the app has zero vendor SDKs.
 */

export type Provider = "demo" | "ollama" | "openai" | "anthropic";

export function getProvider(): Provider {
  const p = (process.env.LLM_PROVIDER || "").trim().toLowerCase();
  if (p === "ollama" || p === "openai" || p === "anthropic") return p;
  return "demo";
}

export function isDemo(): boolean {
  return getProvider() === "demo";
}

/** Human-readable label for the active backend (shown in the UI / responses). */
export function providerLabel(): string {
  switch (getProvider()) {
    case "ollama":
      return `Ollama (${process.env.LLM_MODEL || "llama3.2"})`;
    case "openai":
      return `${process.env.LLM_MODEL || "openai-compatible"}`;
    case "anthropic":
      return process.env.LLM_MODEL || "claude";
    default:
      return "offline heuristic";
  }
}

type CompleteArgs = { system: string; user: string; maxTokens?: number; json?: boolean };

export async function complete({ system, user, maxTokens = 1500, json = true }: CompleteArgs): Promise<string> {
  const provider = getProvider();
  if (provider === "demo") throw new Error("demo provider has no model");
  if (provider === "ollama") return ollama(system, user, maxTokens, json);
  if (provider === "anthropic") return anthropic(system, user, maxTokens);
  return openai(system, user, maxTokens, json);
}

// ── Ollama (local, free) ─────────────────────────────────────────────────────
async function ollama(system: string, user: string, maxTokens: number, json: boolean): Promise<string> {
  const base = process.env.LLM_BASE_URL || "http://localhost:11434";
  const model = process.env.LLM_MODEL || "llama3.2";
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      ...(json ? { format: "json" } : {}),
      options: { num_predict: maxTokens, temperature: 0.4 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data?.message?.content ?? "";
}

// ── OpenAI-compatible (Groq / OpenRouter / LM Studio / OpenAI) ────────────────
async function openai(system: string, user: string, maxTokens: number, json: boolean): Promise<string> {
  const base = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  const key = process.env.LLM_API_KEY || "";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.4,
      ...(json ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Provider ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

// ── Anthropic Messages API (optional, no SDK) ────────────────────────────────
async function anthropic(system: string, user: string, maxTokens: number): Promise<string> {
  const key = process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY || "";
  const model = process.env.LLM_MODEL || "claude-sonnet-4-6";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data?.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
}
