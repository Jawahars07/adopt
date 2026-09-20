import { buildLedger, type VerdictKind } from "@/lib/analytics";
import { getWorkspace } from "@/lib/store";
import { Chip, Empty, Eyebrow, Figure, PageHead, ProvenanceNote, type Tone } from "@/components/ui";

export const dynamic = "force-dynamic";

const VERDICT: Record<VerdictKind, { label: string; tone: Tone }> = {
  migrate: { label: "Migrate", tone: "signal" },
  cut: { label: "Stop", tone: "negative" },
  fix: { label: "Fix", tone: "caution" },
  scale: { label: "Scale", tone: "positive" },
  watch: { label: "Watch", tone: "neutral" },
};

export default async function LedgerPage() {
  const ws = await getWorkspace();
  const rows = buildLedger(ws.useCases);
  const counts = rows.reduce<Record<string, number>>(
    (a, r) => ({ ...a, [r.kind]: (a[r.kind] ?? 0) + 1 }),
    {},
  );
  // Summary -> Context -> Details. Only things that need a decision get a card;
  // what is already working gets one line each, because "keep doing this" does
  // not need a paragraph and eight of them bury the two that do.
  const decisions = rows.filter((r) => r.kind === "migrate" || r.kind === "cut" || r.kind === "fix");
  const working = rows.filter((r) => r.kind === "scale");

  return (
    <div className="space-y-8">
      <PageHead
        eyebrow="Ledger"
        title="What the work is telling you"
        lede="Every tool and task category your people have actually tried, with what happened and what to do next. A usage dashboard reports that adoption fell. This reports why, because the reason was captured at the moment someone gave up."
        right={<ProvenanceNote source={ws.source} isDemo={ws.org.isDemo} />}
      />

      <section className="panel p-6">
        <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-5">
          <Figure label="Move elsewhere" value={String(counts.migrate ?? 0)} sub="Right task, wrong tool" tone="signal" />
          <Figure label="Stop routing" value={String(counts.cut ?? 0)} sub="Blocker is structural" tone="negative" />
          <Figure label="Fixable" value={String(counts.fix ?? 0)} sub="Prompt or surface problem" />
          <Figure label="Working" value={String(counts.scale ?? 0)} sub="Widen these" tone="positive" />
          <Figure label="Too early" value={String(counts.watch ?? 0)} sub="Not enough signal" />
        </div>
      </section>

      {decisions.length === 0 ? (
        <Empty title="No verdicts yet">
          Route a few tasks and record what happened. Once a tool has five attempts in a category,
          Adopt will rule on it rather than guess.
        </Empty>
      ) : (
        <section className="space-y-3">
          {decisions.map((r) => {
            const v = VERDICT[r.kind];
            const accent =
              r.kind === "migrate" ? "border-l-signal"
              : r.kind === "cut" ? "border-l-negative"
              : r.kind === "fix" ? "border-l-caution"
              : "border-l-positive";
            return (
              <article key={r.key} className={`panel border-l-2 p-5 ${accent}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <Chip tone={v.tone}>{v.label}</Chip>
                  <span className="text-sm font-medium text-ink">{r.toolName}</span>
                  <span className="text-dim">·</span>
                  <span className="text-sm text-muted">{r.categoryLabel}</span>
                  <span className="num ml-auto text-xs text-dim">
                    {r.adopted}/{r.attempts} adopted · {r.adoptionRate}%
                    {r.avgRating > 0 ? ` · ${r.avgRating}/5` : ""}
                  </span>
                </div>

                <p className="display mt-3 text-lg leading-snug text-ink">{r.headline}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{r.evidence}</p>

                {r.action ? (
                  <p className="mt-3 border-l border-hairline-strong pl-3 text-sm leading-relaxed text-muted">
                    <span className="font-medium text-ink">Do next. </span>
                    {r.action}
                  </p>
                ) : null}
              </article>
            );
          })}
        </section>
      )}

      {working.length > 0 ? (
        <section className="panel overflow-hidden">
          <div className="flex items-baseline justify-between border-b border-hairline px-4 py-3">
            <Eyebrow>Already working</Eyebrow>
            <span className="text-xs text-dim">No action needed — widen where useful</span>
          </div>
          {working.map((r) => (
            <div
              key={r.key}
              className="flex flex-wrap items-center gap-3 border-t border-hairline px-4 py-2.5 first:border-t-0 hover:bg-surface-2"
            >
              <Chip tone="positive">Scale</Chip>
              <span className="text-sm text-ink">{r.toolName}</span>
              <span className="text-dim">·</span>
              <span className="text-sm text-muted">{r.categoryLabel}</span>
              <span className="num ml-auto text-xs text-dim">
                {r.adopted}/{r.attempts} · {r.adoptionRate}% · {r.avgRating}/5
              </span>
            </div>
          ))}
        </section>
      ) : null}

      {counts.watch ? (
        <section className="panel p-5">
          <Eyebrow>Not enough signal</Eyebrow>
          <p className="mt-1.5 text-sm text-muted">
            {counts.watch} tool and category {counts.watch === 1 ? "pair has" : "pairs have"} fewer
            than five recorded attempts. Adopt will not rule on those — a verdict from three data
            points is a guess wearing a badge.
          </p>
        </section>
      ) : null}
    </div>
  );
}
