import { buildShadowReport } from "@/lib/analytics";
import { getWorkspace } from "@/lib/store";
import { Chip, Empty, Eyebrow, Figure, PageHead, ProvenanceNote } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ShadowPage() {
  const ws = await getWorkspace();
  const report = buildShadowReport(ws.shadow, ws.stack);

  return (
    <div className="space-y-8">
      <PageHead
        eyebrow="Shadow"
        title="Work that left the stack, and why it left"
        lede="Unapproved tool use recorded as a routing failure rather than a policy violation. Every event here started as a real task that the licensed stack turned away or disappointed."
        right={<ProvenanceNote source={ws.source} isDemo={ws.org.isDemo} />}
      />

      <section className="panel p-6">
        <div className="grid gap-7 sm:grid-cols-3">
          <Figure label="Recorded events" value={String(report.total)} sub="Last 90 days" />
          <Figure
            label="Caused by a gap you created"
            value={`${report.explainedByGaps}%`}
            sub="No licensed tool, or blocked by policy"
            tone="signal"
          />
          <Figure
            label="Involving sensitive material"
            value={String(report.sensitiveTotal)}
            sub="Confidential or personal data"
            tone={report.sensitiveTotal > 0 ? "negative" : "positive"}
          />
        </div>

        <p className="mt-6 border-t border-hairline pt-5 text-sm leading-relaxed text-muted">
          <span className="text-ink">Read that middle number first. </span>
          When most unapproved use traces to a gap the organisation created, the remedy is a
          purchase or a policy change — not a warning email. Blocking the tool without closing the
          gap removes the workaround and leaves the task.
        </p>
      </section>

      {report.clusters.length === 0 ? (
        <Empty title="Nothing recorded">
          When Adopt cannot route a task, it asks what the person used instead. Those answers
          collect here.
        </Empty>
      ) : (
        <section className="panel overflow-hidden">
          <div className="border-b border-hairline px-4 py-3">
            <Eyebrow>Where it leaks</Eyebrow>
          </div>
          {report.clusters.map((c) => (
            <div key={c.category} className="border-t border-hairline px-4 py-3 first:border-t-0 hover:bg-surface-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-[180px] flex-1 text-sm text-ink">{c.label}</span>
                <span className="num w-16 text-right text-sm text-muted">{c.events}</span>
                <span className="w-56 truncate text-xs text-dim">mostly {c.topTool}</span>
                <span className="w-44 text-right">
                  {c.isCoverageGap ? (
                    <Chip tone="negative">No usable licensed tool</Chip>
                  ) : c.sensitiveEvents > 0 ? (
                    <Chip tone="caution">{c.sensitiveEvents} sensitive</Chip>
                  ) : (
                    <Chip tone="neutral">Preference</Chip>
                  )}
                </span>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="panel p-5">
        <Eyebrow>Tools reached for</Eyebrow>
        <div className="mt-4 space-y-2.5">
          {report.topTools.map((t) => {
            const pct = report.total ? (t.count / report.total) * 100 : 0;
            return (
              <div key={t.tool} className="flex items-center gap-3">
                <span className="w-56 shrink-0 truncate text-sm text-muted">{t.tool}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-signal-dim" style={{ width: `${pct}%` }} />
                </div>
                <span className="num w-8 text-right text-sm text-dim">{t.count}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
