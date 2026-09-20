"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PlaybookEntry, StoredUseCase } from "@/lib/types";
import { abandonmentSummary, buildLedger, type LedgerRow } from "@/lib/blockers";

const STORE_KEY = "adopt.usecases";
const PLAYBOOK_KEY = "adopt.playbook";

const VERDICT_STYLE: Record<LedgerRow["kind"], { chip: string; card: string; word: string }> = {
  kill: { chip: "bg-rose-100 text-rose-700", card: "border-rose-200 bg-rose-50/60", word: "Stop" },
  fix: { chip: "bg-amber-100 text-amber-700", card: "border-amber-200 bg-amber-50/60", word: "Fix" },
  scale: { chip: "bg-emerald-100 text-emerald-700", card: "border-emerald-200 bg-emerald-50/60", word: "Scale" },
  watch: { chip: "bg-black/5 text-black/50", card: "border-black/10 bg-black/[0.02]", word: "Watch" },
};

export default function Dashboard() {
  const [cases, setCases] = useState<StoredUseCase[]>([]);
  const [learned, setLearned] = useState<PlaybookEntry[]>([]);

  useEffect(() => {
    // Storage can be corrupt, blocked, or hold a shape from an older version —
    // guard each read so a bad value degrades to empty instead of blanking the page.
    const read = <T,>(key: string): T[] => {
      try {
        const v = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(v) ? (v as T[]) : [];
      } catch {
        return [];
      }
    };
    setCases(read<StoredUseCase>(STORE_KEY));
    setLearned(read<PlaybookEntry>(PLAYBOOK_KEY));
  }, []);

  // The Abandonment Ledger — every other adoption tool stops at the usage numbers
  // above. This turns the rejections into scale / fix / stop decisions.
  const ledger = buildLedger(cases, learned);
  const summary = abandonmentSummary(ledger);

  const total = cases.length;
  const adopted = cases.filter((c) => c.adopted === true).length;
  const adoptionRate = total ? Math.round((adopted / total) * 100) : 0;
  const rated = cases.filter((c) => typeof c.rating === "number");
  const avgRating = rated.length
    ? (rated.reduce((s, c) => s + (c.rating || 0), 0) / rated.length).toFixed(1)
    : "—";
  const avgFit = total ? Math.round(cases.reduce((s, c) => s + c.fitScore, 0) / total) : 0;
  const painPoints = cases.filter((c) => c.painPoint).map((c) => ({ task: c.title, pain: c.painPoint! }));

  // Top recommended tools.
  const toolCounts = cases.reduce<Record<string, number>>((acc, c) => {
    acc[c.recommendedTool] = (acc[c.recommendedTool] || 0) + 1;
    return acc;
  }, {});
  const topTools = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  function clearAll() {
    localStorage.removeItem(STORE_KEY);
    localStorage.removeItem(PLAYBOOK_KEY);
    setCases([]);
    setLearned([]);
  }

  if (total === 0) {
    return (
      <div className="card p-10 text-center">
        <h1 className="text-xl font-semibold">No use cases yet</h1>
        <p className="mt-2 text-black/60">Qualify a task and it will show up here with adoption metrics.</p>
        <Link href="/" className="btn-primary mt-5">Add a use case</Link>
      </div>
    );
  }

  const stats = [
    { label: "Use cases", value: total },
    { label: "Adoption rate", value: `${adoptionRate}%` },
    { label: "Avg. rating", value: avgRating },
    { label: "Avg. GenAI fit", value: `${avgFit}/100` },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <span className="label">Adoption dashboard</span>
          <h1 className="text-2xl font-bold tracking-tight">Real-life usage at a glance</h1>
        </div>
        <button onClick={clearAll} className="btn-ghost text-xs">Clear data</button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <span className="label">{s.label}</span>
            <div className="mt-1 text-3xl font-bold text-accent">{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── The Abandonment Ledger ─────────────────────────────────────────
          Usage dashboards report that adoption fell. They cannot say why,
          because they never captured a reason. This reads the recorded
          blockers and splits the underperformers into the ones worth fixing
          and the ones worth stopping. */}
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="label">Abandonment ledger</span>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">
              Why people stopped — and what to do about it
            </h2>
            <p className="mt-1 max-w-xl text-sm text-black/55">
              Usage dashboards tell you adoption fell. This tells you which use cases to scale,
              which to fix, and which to stop spending attention on.
            </p>
          </div>
          {summary.abandoned > 0 && (
            <div className="rounded-xl border border-black/10 px-4 py-2 text-right">
              <div className="text-2xl font-bold text-rose-500">{summary.abandoned}</div>
              <div className="text-xs text-black/45">
                abandoned of {summary.attempts} attempts
              </div>
            </div>
          )}
        </div>

        {ledger.length === 0 ? (
          <p className="mt-4 rounded-xl border border-black/10 bg-black/[0.02] p-4 text-sm text-black/55">
            Nothing to rule on yet. Mark a use case &quot;Not yet&quot; and record what stopped you —
            that single answer is what makes an abandonment diagnosable instead of just a number
            going down.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {ledger.slice(0, 6).map((row) => {
              const style = VERDICT_STYLE[row.kind];
              return (
                <div key={row.id} className={`rounded-xl border p-4 ${style.card}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.chip}`}>
                      {style.word}
                    </span>
                    <span className="text-sm font-medium text-black/80">{row.pattern}</span>
                    <span className="text-xs text-black/40">· {row.recommendedTool}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-black/75">{row.headline}</p>
                  <p className="mt-1 text-xs text-black/50">{row.evidence}</p>
                  {row.intervention && (
                    <p className="mt-2 border-l-2 border-black/15 pl-3 text-xs text-black/65">
                      <span className="font-semibold">Do next: </span>
                      {row.intervention}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {ledger.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-4 border-t border-black/5 pt-4 text-xs text-black/45">
            <span>{summary.scaleCount} to scale</span>
            <span>{summary.fixCount} to fix</span>
            <span>{summary.killCount} to stop</span>
          </div>
        )}
      </div>

      {/* Top tools */}
      <div className="card p-6">
        <span className="label">Most-recommended tools</span>
        <div className="mt-4 space-y-3">
          {topTools.map(([tool, count]) => (
            <div key={tool} className="flex items-center gap-3">
              <span className="w-56 shrink-0 truncate text-sm text-black/70">{tool}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/5">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(count / total) * 100}%` }} />
              </div>
              <span className="w-6 text-right text-sm font-semibold text-black/50">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pain points */}
      {painPoints.length > 0 && (
        <div className="card p-6">
          <span className="label">Reported pain points &amp; improvement opportunities</span>
          <ul className="mt-3 space-y-2">
            {painPoints.map((p, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium text-black/80">{p.task}:</span>{" "}
                <span className="text-black/60">{p.pain}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent use cases */}
      <div className="card overflow-hidden">
        <div className="border-b border-black/5 p-4">
          <span className="label">Recent use cases</span>
        </div>
        <div className="divide-y divide-black/5">
          {cases.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.title}</p>
                <p className="truncate text-xs text-black/45">{c.recommendedTool}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs">
                <span className="font-semibold text-accent">{c.fitScore}/100</span>
                {c.adopted === true && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">adopted</span>}
                {c.adopted === false && <span className="rounded-full bg-black/5 px-2 py-0.5 text-black/50">pending</span>}
                {c.rating && <span className="text-black/50">★ {c.rating}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
