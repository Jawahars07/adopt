"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { StoredUseCase } from "@/lib/types";

const STORE_KEY = "adopt.usecases";

export default function Dashboard() {
  const [cases, setCases] = useState<StoredUseCase[]>([]);

  useEffect(() => {
    try {
      setCases(JSON.parse(localStorage.getItem(STORE_KEY) || "[]"));
    } catch {
      setCases([]);
    }
  }, []);

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
    setCases([]);
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
