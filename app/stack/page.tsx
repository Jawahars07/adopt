import { buildStackReport, type ToolVerdict } from "@/lib/analytics";
import { getWorkspace } from "@/lib/store";
import { Chip, Eyebrow, Figure, PageHead, ProvenanceNote, Reconcile, Spark, eur, num, type Tone } from "@/components/ui";

export const dynamic = "force-dynamic";

const VERDICT: Record<ToolVerdict, { label: string; tone: Tone }> = {
  scale: { label: "Scale", tone: "positive" },
  keep: { label: "Keep", tone: "neutral" },
  consolidate: { label: "Consolidate", tone: "caution" },
  cut: { label: "Cut", tone: "negative" },
};

export default async function StackPage() {
  const ws = await getWorkspace();
  const report = buildStackReport(ws.stack, ws.usage, ws.useCases, ws.org.headcount);
  const earnedShare = report.totalSeats ? report.totalActiveSeats / report.totalSeats : 0;

  return (
    <div className="space-y-8">
      <PageHead
        eyebrow="Stack"
        title="What your AI stack costs, and what it returns"
        lede="Seat counts come from each vendor's admin console. Whether the work stuck comes from Adopt. Neither number decides anything on its own — a seat can be open every day and still be the wrong tool for every task that person has."
        right={<ProvenanceNote source={ws.source} isDemo={ws.org.isDemo} />}
      />

      {/* Tier 1 — the decision, in one line. */}
      <section className="panel p-6">
        <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            label="Reclaimable, annualised"
            value={eur(report.reclaimableAnnualEur)}
            sub={`${num(report.reclaimableSeats)} seats paid for and inactive`}
            tone="signal"
          />
          <Figure label="Annual stack cost" value={eur(report.totalAnnualEur)} sub={`${ws.stack.length} tools`} />
          <Figure
            label="Seats licensed"
            value={num(report.totalSeats)}
            sub={`across ${num(ws.org.headcount)} people`}
          />
          <Figure
            label="Seats active"
            value={num(report.totalActiveSeats)}
            sub={`${Math.round(earnedShare * 100)}% of what you pay for`}
            tone={earnedShare < 0.5 ? "negative" : "positive"}
          />
        </div>

        {/* The signature: bought against earned, with the shortfall drawn. */}
        <div className="mt-6">
          <div className="mb-2 flex items-baseline justify-between text-xs">
            <span className="text-muted">
              Seats earning their keep · <span className="num text-ink">{num(report.totalActiveSeats)}</span>
            </span>
            <span className="text-muted">
              Idle · <span className="num text-negative">{num(report.reclaimableSeats)}</span>
            </span>
          </div>
          <Reconcile earned={report.totalActiveSeats} total={report.totalSeats} />
        </div>
      </section>

      {/* Tier 2 — per tool. */}
      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <Eyebrow>Per tool</Eyebrow>
          <span className="text-xs text-dim">Ranked by money sitting idle</span>
        </div>

        <div className="hidden px-4 py-2 text-[11px] uppercase tracking-wider text-dim md:flex md:items-center md:gap-4">
          <span className="flex-1">Tool</span>
          <span className="w-20 text-right">Seats</span>
          <span className="w-24 text-right">Seat use</span>
          <span className="w-28 text-right">Task adoption</span>
          <span className="w-20">Trend</span>
          <span className="w-28 text-right">Idle / yr</span>
          <span className="w-28 text-right">Verdict</span>
        </div>

        {report.tools.map((t) => (
          <div key={t.slug} className="border-t border-hairline">
            <div className="flex flex-wrap items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-2">
              <div className="min-w-[180px] flex-1">
                <div className="text-sm font-medium text-ink">{t.name}</div>
                <div className="text-xs text-dim">{t.vendor}</div>
              </div>
              <div className="num w-20 text-right text-sm text-muted">{num(t.seats)}</div>
              <div className="num w-24 text-right text-sm text-muted">{t.utilisation}%</div>
              <div className="num w-28 text-right text-sm text-muted">
                {t.taskAdoption === null ? (
                  <span className="text-dim">—</span>
                ) : (
                  <>
                    {t.taskAdoption}%<span className="ml-1 text-[11px] text-dim">({t.taskAttempts})</span>
                  </>
                )}
              </div>
              <div className="w-20">
                <Spark points={t.trend} tone={t.verdict === "cut" ? "negative" : t.verdict === "scale" ? "positive" : "neutral"} />
              </div>
              <div className="num w-28 text-right text-sm text-negative">{eur(t.idleAnnualEur)}</div>
              <div className="w-28 text-right">
                <Chip tone={VERDICT[t.verdict].tone}>{VERDICT[t.verdict].label}</Chip>
              </div>
            </div>
            <p className="px-4 pb-3 text-xs leading-relaxed text-muted">{t.rationale}</p>
          </div>
        ))}
      </section>

      {/* Tier 3 — the questions the table raises. */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="panel p-5">
          <Eyebrow>Overlapping coverage</Eyebrow>
          <p className="mt-1.5 text-sm text-muted">
            Tools strong in the same categories. Redundancy in an AI stack hides well, because the
            products have different names and the same job.
          </p>
          <div className="mt-4 space-y-3">
            {report.overlaps.length === 0 ? (
              <p className="text-sm text-dim">No meaningful overlap. Unusual, and worth keeping.</p>
            ) : (
              report.overlaps.slice(0, 4).map((o) => (
                <div key={`${o.a}-${o.b}`} className="panel-inset p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-ink">
                      {o.aName} <span className="text-dim">and</span> {o.bName}
                    </span>
                    <span className="num text-sm text-muted">{eur(o.combinedAnnualEur)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Both strong across {o.categories.length} categories. The figure is what you
                    currently spend on the pair, not a saving — consolidating would recover part of
                    it, and the Ledger says which of the two the work actually sticks to.
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel p-5">
          <Eyebrow>Uncovered work</Eyebrow>
          <p className="mt-1.5 text-sm text-muted">
            Categories no licensed tool serves well. These are the places work leaves the stack.
          </p>
          <div className="mt-4">
            {report.coverageGaps.length === 0 ? (
              <p className="text-sm text-dim">
                Every task category has a capable licensed tool. Where work still leaves the stack,
                the cause is routing or policy rather than a missing purchase — see{" "}
                <a href="/shadow" className="text-signal underline-offset-2 hover:underline">
                  Shadow
                </a>
                .
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {report.coverageGaps.map((g) => (
                  <Chip key={g.category} tone="caution">
                    {g.label}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
