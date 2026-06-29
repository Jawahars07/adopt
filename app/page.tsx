"use client";

import { useState } from "react";
import type { Analysis, StoredUseCase } from "@/lib/types";

const EXAMPLES = [
  "Summarise long email threads before I reply",
  "Turn my meeting notes into action items every week",
  "Build a first-draft slide deck from a project brief",
  "Find the right policy document on SharePoint",
];

const STORE_KEY = "adopt.usecases";

function loadStore(): StoredUseCase[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveCase(c: StoredUseCase) {
  const all = loadStore();
  const i = all.findIndex((x) => x.id === c.id);
  if (i >= 0) all[i] = c;
  else all.unshift(c);
  localStorage.setItem(STORE_KEY, JSON.stringify(all.slice(0, 100)));
}

const IMPACT_COLOR: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-rose-100 text-rose-700",
};

export default function Home() {
  const [task, setTask] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<StoredUseCase | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  async function analyze(e?: React.FormEvent) {
    e?.preventDefault();
    if (!task.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setSaved(false);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Something went wrong.");
      const data: Analysis = await res.json();
      const stored: StoredUseCase = { ...data, id: crypto.randomUUID(), task, createdAt: Date.now() };
      setResult(stored);
      saveCase(stored);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function recordFeedback(patch: Partial<StoredUseCase>) {
    if (!result) return;
    const updated = { ...result, ...patch };
    setResult(updated);
    saveCase(updated);
    setSaved(true);
  }

  return (
    <div className="space-y-8">
      {/* Hero / intake */}
      <section className="space-y-5">
        <div className="space-y-2">
          <span className="label">GenAI adoption companion</span>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Describe a work task. Get a qualified GenAI use case.
          </h1>
          <p className="max-w-2xl text-black/60">
            Adopt turns an everyday task into a fit assessment, the right Microsoft 365 Copilot tool,
            a ready-to-paste prompt, and a plain-language adoption guide — then tracks whether it stuck.
          </p>
        </div>

        <form onSubmit={analyze} className="card space-y-3 p-5">
          <label className="label" htmlFor="task">What do you want to get done?</label>
          <textarea
            id="task"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="e.g. Turn my weekly team meeting notes into clear action items"
            className="input min-h-[96px] resize-y"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setTask(ex)}
                  className="rounded-full border border-black/10 px-3 py-1 text-xs text-black/60 hover:bg-black/5"
                >
                  {ex}
                </button>
              ))}
            </div>
            <button type="submit" className="btn-primary" disabled={loading || !task.trim()}>
              {loading ? "Analysing…" : "Qualify this use case"}
            </button>
          </div>
        </form>

        {error && <p className="text-sm text-rose-600">{error}</p>}
      </section>

      {/* Result */}
      {result && (
        <section className="space-y-5">
          {result.demo && (
            <p className="rounded-xl bg-amber-50 px-4 py-2 text-xs text-amber-700">
              Demo mode — generated offline without an API key. Add <code>ANTHROPIC_API_KEY</code> for live model analysis.
            </p>
          )}

          {/* Qualification */}
          <div className="card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="label">Use case</span>
                <h2 className="text-xl font-semibold">{result.title}</h2>
              </div>
              <div className="text-right">
                <span className="label">GenAI fit</span>
                <div className="text-3xl font-bold text-accent">{result.fitScore}<span className="text-base text-black/30">/100</span></div>
              </div>
            </div>

            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-black/5">
              <div className="h-full rounded-full bg-accent" style={{ width: `${result.fitScore}%` }} />
            </div>

            <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
              <span className={`rounded-full px-3 py-1 ${IMPACT_COLOR[result.impact]}`}>Impact: {result.impact}</span>
              <span className="rounded-full bg-black/5 px-3 py-1 text-black/60">Effort: {result.effort}</span>
              <span className="rounded-full bg-accent-soft px-3 py-1 text-accent">{result.recommendedTool}</span>
            </div>

            <p className="mt-4 text-sm text-black/70">{result.verdict}</p>
          </div>

          {/* Adoption guide */}
          <div className="card p-6">
            <span className="label">Adoption guide</span>
            <ol className="mt-3 space-y-3">
              {result.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">
                    {i + 1}
                  </span>
                  <span className="text-black/80">{s}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Ready-to-use prompt */}
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <span className="label">Ready-to-use prompt</span>
              <button
                className="btn-ghost text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(result.prompt);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-ink p-4 text-xs leading-relaxed text-white/90">
              {result.prompt}
            </pre>
          </div>

          {/* Cautions */}
          <div className="card p-6">
            <span className="label">Before you adopt</span>
            <ul className="mt-3 space-y-2">
              {result.cautions.map((c, i) => (
                <li key={i} className="flex gap-2 text-sm text-black/70">
                  <span className="text-accent">•</span> {c}
                </li>
              ))}
            </ul>
          </div>

          {/* Feedback capture */}
          <div className="card p-6">
            <span className="label">Did it help? (captured for the adoption dashboard)</span>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-black/60">Rate:</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => recordFeedback({ rating: n })}
                    className={`h-8 w-8 rounded-lg border text-sm font-semibold ${
                      result.rating && result.rating >= n
                        ? "border-accent bg-accent text-white"
                        : "border-black/10 text-black/40 hover:bg-black/5"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => recordFeedback({ adopted: true })} className={`btn-ghost text-xs ${result.adopted === true ? "border-accent text-accent" : ""}`}>
                  Adopted it
                </button>
                <button onClick={() => recordFeedback({ adopted: false })} className={`btn-ghost text-xs ${result.adopted === false ? "border-rose-400 text-rose-500" : ""}`}>
                  Not yet
                </button>
              </div>
            </div>
            <input
              className="input mt-3"
              placeholder="Any pain point or blocker? (optional)"
              defaultValue={result.painPoint || ""}
              onBlur={(e) => recordFeedback({ painPoint: e.target.value.trim() || undefined })}
            />
            {saved && <p className="mt-2 text-xs text-emerald-600">Saved to the dashboard.</p>}
          </div>
        </section>
      )}
    </div>
  );
}
