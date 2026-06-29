"use client";

import { useState } from "react";
import { tokenize } from "@/lib/playbook";
import type { Analysis, StoredUseCase, PlaybookEntry, Improvement } from "@/lib/types";

const EXAMPLES = [
  "Summarise long email threads before I reply",
  "Turn my meeting notes into action items every week",
  "Build a first-draft slide deck from a project brief",
  "Find the right policy document on SharePoint",
];

const STORE_KEY = "adopt.usecases";
const PLAYBOOK_KEY = "adopt.playbook";

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

function loadLearned(): PlaybookEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(PLAYBOOK_KEY) || "[]");
  } catch {
    return [];
  }
}

/** Fold a piece of feedback into the Living Playbook — this is the flywheel. */
function learnFromFeedback(c: StoredUseCase) {
  const all = loadLearned();
  const id = `learned-${c.recommendedTool}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const existing = all.find((e) => e.id === id);
  const rated = typeof c.rating === "number";
  if (existing) {
    existing.totalCount += 1;
    if (c.adopted) existing.adoptedCount += 1;
    if (rated) {
      const n = existing.ratingCount || 0;
      existing.avgRating = (existing.avgRating * n + c.rating!) / (n + 1);
      existing.ratingCount = n + 1;
    }
    // Keep the most recent successful prompt as the canonical one.
    if (c.adopted) existing.prompt = c.prompt;
    existing.updatedAt = Date.now();
  } else {
    all.unshift({
      id,
      pattern: c.title,
      keywords: Array.from(new Set([...tokenize(c.task), ...tokenize(c.title)])).slice(0, 12),
      recommendedTool: c.recommendedTool,
      prompt: c.prompt,
      adoptedCount: c.adopted ? 1 : 0,
      totalCount: 1,
      avgRating: rated ? c.rating! : 0,
      ratingCount: rated ? 1 : 0,
      origin: "learned",
      updatedAt: Date.now(),
    });
  }
  localStorage.setItem(PLAYBOOK_KEY, JSON.stringify(all.slice(0, 100)));
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
  const [improving, setImproving] = useState(false);
  const [improvement, setImprovement] = useState<Improvement | null>(null);

  async function analyze(e?: React.FormEvent) {
    e?.preventDefault();
    if (!task.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setSaved(false);
    setImprovement(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send accumulated learning so retrieval improves with adoption (flywheel).
        body: JSON.stringify({ task, playbook: loadLearned() }),
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
    learnFromFeedback(updated); // ← feed the flywheel
    setSaved(true);
  }

  async function improvePrompt() {
    if (!result) return;
    setImproving(true);
    setImprovement(null);
    try {
      const res = await fetch("/api/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: result.prompt, painPoint: result.painPoint || "", rating: result.rating || 0 }),
      });
      const data: Improvement = await res.json();
      setImprovement(data);
      // Adopt the improved prompt as the canonical one going forward.
      recordFeedback({ prompt: data.improvedPrompt });
    } catch {
      setError("Could not improve the prompt right now.");
    } finally {
      setImproving(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Hero / intake */}
      <section className="space-y-5">
        <div className="space-y-2">
          <span className="label">Self-improving GenAI adoption companion</span>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Describe a work task. Get a qualified GenAI use case.
          </h1>
          <p className="max-w-2xl text-black/60">
            Adopt qualifies the task, recommends the right Microsoft 365 Copilot tool, and gives you a
            ready-to-use prompt — drawing on a <strong>living playbook</strong> of what colleagues have
            actually adopted, and rewriting prompts that underperform.
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

          {/* Related-plays banner — the flywheel made visible */}
          {result.relatedProven && result.relatedProven.length > 0 && (() => {
            const hasLearned = result.relatedProven.some((p) => p.origin === "learned");
            return (
              <div className="rounded-2xl border border-accent/20 bg-accent-soft p-5">
                <span className="label text-accent">
                  {hasLearned ? "🔁 Learned from real adoption" : "📚 Suggested plays (examples)"}
                </span>
                <p className="mt-1 text-sm text-black/70">
                  {hasLearned
                    ? "Similar tasks were adopted before — these are surfaced because they worked, not because a prompt guessed."
                    : "Example plays for similar tasks. As people rate and adopt, real adoption stats appear here and re-rank them."}
                </p>
                <div className="mt-3 space-y-2">
                  {result.relatedProven.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-2 text-sm">
                      <span className="font-medium">{p.pattern}</span>
                      {p.origin === "learned" && p.sampleSize > 0 ? (
                        <span className="text-xs text-black/50">
                          {p.recommendedTool} · adopted {p.adoptionRate}% · ★ {p.avgRating.toFixed(1)} ({p.sampleSize})
                        </span>
                      ) : (
                        <span className="text-xs text-black/40">
                          {p.recommendedTool} · example · not yet measured
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

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

          {/* Feedback capture + self-improvement */}
          <div className="card p-6">
            <span className="label">Did it help? (captured for the dashboard &amp; the playbook)</span>
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
            {saved && <p className="mt-2 text-xs text-emerald-600">Saved — and folded into the living playbook.</p>}

            {/* Evaluator-Optimizer: offered when the prompt underperformed */}
            {typeof result.rating === "number" && result.rating <= 3 && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-800">
                  Low rating noted. Adopt can rewrite this prompt to fix what didn&apos;t work.
                </p>
                <button onClick={improvePrompt} className="btn-primary mt-3 text-xs" disabled={improving}>
                  {improving ? "Improving…" : "⚙️ Improve this prompt automatically"}
                </button>
              </div>
            )}

            {improvement && (
              <div className="mt-4 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div>
                  <span className="label text-emerald-700">What it diagnosed</span>
                  <p className="mt-1 text-sm text-black/75">{improvement.critique}</p>
                </div>
                <div>
                  <span className="label text-emerald-700">Improved prompt (now saved)</span>
                  <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-ink p-3 text-xs leading-relaxed text-white/90">
                    {improvement.improvedPrompt}
                  </pre>
                </div>
                <div>
                  <span className="label text-emerald-700">Changes</span>
                  <ul className="mt-1 space-y-1">
                    {improvement.changes.map((c, i) => (
                      <li key={i} className="text-xs text-black/70">• {c}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
