"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SEED_PLAYBOOK, adoptionScore } from "@/lib/playbook";
import type { PlaybookEntry } from "@/lib/types";

const PLAYBOOK_KEY = "adopt.playbook";

export default function Playbook() {
  const [learned, setLearned] = useState<PlaybookEntry[]>([]);

  useEffect(() => {
    try {
      setLearned(JSON.parse(localStorage.getItem(PLAYBOOK_KEY) || "[]"));
    } catch {
      setLearned([]);
    }
  }, []);

  // Merge seed + learned, dedupe by id (learned overrides). Rank measured plays by
  // real adoption success; seeds are examples and sort after, by similarity-neutral order.
  const byId = new Map<string, PlaybookEntry>();
  [...SEED_PLAYBOOK, ...learned].forEach((e) => byId.set(e.id, e));
  const entries = Array.from(byId.values()).sort((a, b) => {
    const am = a.origin === "learned" ? 1 : 0;
    const bm = b.origin === "learned" ? 1 : 0;
    if (am !== bm) return bm - am; // measured plays first
    return adoptionScore(b) - adoptionScore(a);
  });
  const measuredCount = entries.filter((e) => e.origin === "learned").length;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <span className="label">The living playbook</span>
        <h1 className="text-2xl font-bold tracking-tight">What actually gets adopted — ranked by results</h1>
        <p className="max-w-2xl text-black/60">
          This is the moat. Every piece of feedback folds in here, so the highest-performing GenAI
          plays rise to the top automatically. Copy the code in an afternoon; you can&apos;t copy the
          accumulated adoption data that makes these rankings true.
        </p>
        <p className="text-xs text-black/45">
          {measuredCount > 0
            ? `${measuredCount} measured play${measuredCount === 1 ? "" : "s"} from real feedback · the rest are examples until adopted.`
            : "All entries below are examples until you rate and adopt them — then real stats appear."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {entries.map((e) => {
          const measured = e.origin === "learned" && e.totalCount > 0;
          const rate = e.totalCount > 0 ? Math.round((e.adoptedCount / e.totalCount) * 100) : 0;
          return (
            <div key={e.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold leading-snug">{e.pattern}</h2>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${measured ? "bg-emerald-100 text-emerald-700" : "bg-black/5 text-black/50"}`}>
                  {measured ? "measured" : "example"}
                </span>
              </div>
              <p className="mt-1 text-xs text-accent">{e.recommendedTool}</p>

              {measured ? (
                <>
                  <div className="mt-3 flex items-center gap-4 text-xs text-black/60">
                    <span>Adopted <strong className="text-black/80">{rate}%</strong></span>
                    <span>★ <strong className="text-black/80">{e.avgRating ? e.avgRating.toFixed(1) : "—"}</strong></span>
                    <span>{e.totalCount} use{e.totalCount === 1 ? "" : "s"}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/5">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(adoptionScore(e) * 100)}%` }} />
                  </div>
                </>
              ) : (
                <p className="mt-3 text-xs text-black/40">Example play · not yet measured — rate &amp; adopt it to start tracking.</p>
              )}

              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-black/50 hover:text-black/70">View prompt</summary>
                <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-ink p-3 text-[11px] leading-relaxed text-white/90">{e.prompt}</pre>
              </details>
            </div>
          );
        })}
      </div>

      <div className="card p-5 text-sm text-black/60">
        <strong className="text-black/80">How it grows:</strong> when you rate and adopt a use case on the{" "}
        <Link href="/" className="text-accent underline">home page</Link>, it folds into this playbook —
        increasing that play&apos;s adoption rate and rating, and re-ranking the library. New tasks then
        retrieve from here, so recommendations get better with every use.
      </div>
    </div>
  );
}
