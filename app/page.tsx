"use client";

import { useState } from "react";
import { BLOCKERS } from "@/lib/blockers";
import { COMMON_SHADOW_TOOLS, SENSITIVITY_LEVELS, type Sensitivity } from "@/lib/catalog";
import { Chip, Eyebrow } from "@/components/ui";
import type { RoutingResult } from "@/lib/routing";

const EXAMPLES = [
  "Summarise this long client email thread before I reply",
  "Read the 90-page supplier contract and pull out our obligations",
  "Competitor benchmark of the European market, with sources I can check",
  "Every week I compile the same status report from four systems",
];

type Routed = RoutingResult & { id: string };

export default function RoutePage() {
  const [task, setTask] = useState("");
  const [sensitivity, setSensitivity] = useState<Sensitivity>("internal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Routed | null>(null);
  const [adopted, setAdopted] = useState<boolean | null>(null);
  const [blocker, setBlocker] = useState<string | null>(null);
  const [shadowTool, setShadowTool] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function reset() {
    setResult(null);
    setAdopted(null);
    setBlocker(null);
    setShadowTool(null);
    setSaved(false);
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!task.trim()) return;
    setLoading(true);
    setError("");
    reset();
    try {
      const res = await fetch("/api/route-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, sensitivity }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setResult(data as Routed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function send(patch: Record<string, unknown>) {
    if (!result) return;
    setSaved(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          useCaseId: result.id,
          category: result.category,
          sensitivity: result.sensitivity,
          gapKind: result.gap?.kind ?? null,
          adopted,
          blocker,
          ...patch,
        }),
      });
    } catch {
      /* feedback is best-effort; never block the person on it */
    }
  }

  return (
    <div className="space-y-8">
      <section className="max-w-2xl">
        <Eyebrow>Route</Eyebrow>
        <h1 className="display mt-1.5 text-[34px] font-semibold leading-[1.15] text-ink">
          Describe the task. Adopt picks from the tools you already pay for.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Most people have four or more AI tools and no guidance on which does what, so they run the
          same prompt through several and settle for whichever answers first. This picks one, shows
          its reasoning, and tells you plainly when your stack has nothing good for the job.
        </p>
      </section>

      <form onSubmit={submit} className="panel space-y-4 p-5">
        <div>
          <label htmlFor="task" className="eyebrow">
            What are you trying to get done?
          </label>
          <textarea
            id="task"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="e.g. Turn the weekly ops meeting transcript into action items with owners"
            className="field mt-2 min-h-[92px] resize-y"
          />
        </div>

        <div>
          <span className="eyebrow">How sensitive is the material?</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {SENSITIVITY_LEVELS.map((s) => (
              <button
                key={s.id}
                type="button"
                title={s.note}
                onClick={() => setSensitivity(s.id)}
                className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  sensitivity === s.id
                    ? "border-signal-dim bg-signal-wash text-signal"
                    : "border-hairline text-muted hover:bg-surface-2"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setTask(ex)}
                className="rounded-full border border-hairline px-2.5 py-1 text-[11px] text-dim transition-colors hover:bg-surface-2 hover:text-muted"
              >
                {ex.length > 42 ? ex.slice(0, 40) + "..." : ex}
              </button>
            ))}
          </div>
          <button type="submit" className="btn btn-signal" disabled={loading || !task.trim()}>
            {loading ? "Routing..." : "Route this task"}
          </button>
        </div>
      </form>

      {error ? <p className="text-sm text-negative">{error}</p> : null}

      {result ? (
        <div className="space-y-5">
          {/* The gap comes first when there is one. Leading with a weak
              recommendation and burying the caveat is how people end up
              disappointed, then elsewhere. */}
          {result.gap ? (
            <section className="panel border-l-2 border-l-negative p-5">
              <Chip tone="negative">Stack gap</Chip>
              <p className="display mt-3 text-lg leading-snug text-ink">{result.gap.headline}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{result.gap.detail}</p>
              <p className="mt-3 border-l border-hairline-strong pl-3 text-sm leading-relaxed text-muted">
                <span className="font-medium text-ink">What to do. </span>
                {result.gap.remedy}
              </p>
            </section>
          ) : null}

          {result.primary ? (
            <section className="panel p-5">
              <div className="flex flex-wrap items-center gap-3">
                <Chip tone="signal">Use this</Chip>
                <span className="text-sm text-dim">
                  {result.category.replace("-", " ")}
                  {result.categoryConfidence < 0.4 ? " · low confidence, check this is right" : ""}
                </span>
                <span className="num ml-auto text-sm text-muted">{result.primary.score}/100</span>
              </div>

              <h2 className="display mt-3 text-2xl text-ink">{result.primary.name}</h2>
              <p className="mt-1 text-xs text-dim">
                {result.primary.vendor} · {result.primary.surfaces.slice(0, 4).join(", ")}
              </p>

              <ul className="mt-4 space-y-1.5">
                {result.primary.reasons.map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-signal-dim" />
                    {r}
                  </li>
                ))}
              </ul>

              {result.primary.caveat ? (
                <p className="mt-3 border-l border-hairline-strong pl-3 text-sm leading-relaxed text-dim">
                  <span className="text-muted">Where it disappoints. </span>
                  {result.primary.caveat}
                </p>
              ) : null}
            </section>
          ) : null}

          {result.alternates.length > 0 ? (
            <section className="panel p-5">
              <Eyebrow>Also licensed</Eyebrow>
              <div className="mt-3 space-y-2">
                {result.alternates.map((a) => (
                  <div key={a.slug} className="flex items-center gap-3 text-sm">
                    <span className="flex-1 text-muted">{a.name}</span>
                    <span className="num text-xs text-dim">{a.score}/100</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {result.excluded.length > 0 ? (
            <section className="panel p-5">
              <Eyebrow>Excluded by policy</Eyebrow>
              <div className="mt-3 space-y-2">
                {result.excluded.map((x) => (
                  <div key={x.slug} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="text-muted">{x.name}</span>
                    <span className="text-xs text-dim">{x.reason}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Feedback. The shadow question is asked plainly, without judgement,
              because a defensive question gets a dishonest answer. */}
          <section className="panel p-5">
            <Eyebrow>Did it work?</Eyebrow>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  setAdopted(true);
                  setBlocker(null);
                  setShadowTool(null);
                  send({ adopted: true, rating: 5 });
                }}
                className={`btn text-xs ${adopted === true ? "border-positive text-positive" : ""}`}
              >
                Used it
              </button>
              <button
                onClick={() => {
                  setAdopted(false);
                  setSaved(false);
                }}
                className={`btn text-xs ${adopted === false ? "border-negative text-negative" : ""}`}
              >
                Did not use it
              </button>
            </div>

            {adopted === false ? (
              <div className="mt-4 border-t border-hairline pt-4">
                <span className="eyebrow">What stopped you?</span>
                <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                  {BLOCKERS.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => {
                        setBlocker(b.id);
                        send({ adopted: false, rating: 2, blocker: b.id });
                      }}
                      className={`rounded-md border p-3 text-left transition-colors ${
                        blocker === b.id ? "border-signal-dim bg-signal-wash" : "border-hairline hover:bg-surface-2"
                      }`}
                    >
                      <span className="block text-sm text-ink">{b.label}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-dim">{b.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {adopted === false || result.gap ? (
              <div className="mt-4 border-t border-hairline pt-4">
                <span className="eyebrow">Did you use something else instead?</span>
                <p className="mt-1 text-xs leading-relaxed text-dim">
                  Answer honestly — this is not a compliance check. It is how the organisation finds
                  out which tools it should be buying.
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {COMMON_SHADOW_TOOLS.map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setShadowTool(t);
                        send({ shadowTool: t, shadowReason: result.gap?.kind ?? "Licensed tool did not fit" });
                      }}
                      className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                        shadowTool === t ? "border-signal-dim bg-signal-wash text-signal" : "border-hairline text-muted hover:bg-surface-2"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {saved ? (
              <p className="mt-3 text-xs text-positive">
                Recorded. It will show up in the Ledger once this tool and category have five
                attempts.
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
