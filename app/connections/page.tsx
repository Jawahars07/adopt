import { CONNECTORS, RESEARCHED_NOT_IMPLEMENTED } from "@/lib/connectors";
import { getConnections, getRecentSyncRuns, getUsageProvenance, getWorkspace } from "@/lib/store";
import { Chip, Eyebrow, Figure, PageHead, ProvenanceNote, type Tone } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, Tone> = {
  ready: "positive",
  error: "negative",
  disabled: "neutral",
  unconfigured: "neutral",
};

export default async function ConnectionsPage() {
  const ws = await getWorkspace();
  const [connections, runs, provenance] = await Promise.all([
    getConnections(ws.org.id),
    getRecentSyncRuns(ws.org.id),
    getUsageProvenance(ws.org.id),
  ]);
  const byslug = new Map(connections.map((c) => [c.toolSlug, c]));
  const measuredShare = provenance.api + provenance.seed > 0
    ? Math.round((provenance.api / (provenance.api + provenance.seed)) * 100)
    : 0;

  return (
    <div className="space-y-8">
      <PageHead
        eyebrow="Connections"
        title="Where the seat numbers come from"
        lede="Adopt argues that a seat is idle. That argument is only worth making if the figure came from the vendor's own admin API rather than an estimate — so every number carries its source, and anything derived rather than measured says so."
        right={<ProvenanceNote source={ws.source} isDemo={ws.org.isDemo} />}
      />

      <section className="panel p-6">
        <div className="grid gap-7 sm:grid-cols-3">
          <Figure
            label="Measured from a vendor API"
            value={`${measuredShare}%`}
            sub={`${provenance.api} of ${provenance.api + provenance.seed} monthly rows`}
            tone={measuredShare > 0 ? "positive" : "neutral"}
          />
          <Figure label="Connectors built" value={String(CONNECTORS.length)} sub="Implemented to a documented endpoint" />
          <Figure
            label="Deliberately not built"
            value={String(RESEARCHED_NOT_IMPLEMENTED.length)}
            sub="Endpoint exists, number would mislead"
            tone="caution"
          />
        </div>
        {measuredShare === 0 ? (
          <p className="mt-6 border-t border-hairline pt-5 text-sm leading-relaxed text-muted">
            <span className="text-ink">Every seat figure on the Stack page is currently seeded. </span>
            Connect a vendor below and the same page will recompute from measured activity. Until then the
            euro figures demonstrate the method, not your organisation.
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <Eyebrow>Available connectors</Eyebrow>
        {CONNECTORS.map((c) => {
          const conn = byslug.get(c.slug);
          const status = conn?.status ?? "unconfigured";
          return (
            <article key={c.slug} className="panel p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-ink">{c.name}</span>
                <span className="text-xs text-dim">{c.vendor}</span>
                <span className="ml-auto flex items-center gap-2">
                  {!c.verifiedAgainstLiveTenant ? <Chip tone="caution">Unproven against a live tenant</Chip> : null}
                  <Chip tone={STATUS_TONE[status] ?? "neutral"}>{status}</Chip>
                </span>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <span className="eyebrow">Permissions it needs</span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.requiredScopes.map((s) => (
                      <code key={s} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">
                        {s}
                      </code>
                    ))}
                  </div>
                  <a
                    href={c.docs}
                    className="mt-2 inline-block text-xs text-signal underline-offset-2 hover:underline"
                  >
                    Vendor documentation
                  </a>
                </div>

                <div>
                  <span className="eyebrow">What you provide</span>
                  <ul className="mt-2 space-y-1">
                    {c.fields.map((f) => (
                      <li key={f.key} className="text-xs text-muted">
                        <span className="text-ink">{f.label}</span>
                        {f.secret ? <span className="ml-1.5 text-[10px] text-signal">encrypted at rest</span> : null}
                        <span className="block text-dim">{f.help}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {conn?.lastError ? (
                <p className="mt-3 border-l-2 border-negative pl-3 text-xs text-negative">{conn.lastError}</p>
              ) : null}
              {conn?.lastSyncedAt ? (
                <p className="mt-3 text-xs text-dim">Last synced {new Date(conn.lastSyncedAt).toUTCString()}</p>
              ) : null}
            </article>
          );
        })}
      </section>

      {/* The honest part: vendors with a reachable endpoint that were skipped
          on purpose, with the reason, so nobody rebuilds them by accident. */}
      <section className="panel p-5">
        <Eyebrow>Researched and deliberately not built</Eyebrow>
        <p className="mt-1.5 text-sm text-muted">
          An endpoint exists for each of these. Wiring it would have been quick and would have produced a
          number that looks authoritative and measures something other than what the Stack page claims.
        </p>
        <div className="mt-4 space-y-3">
          {RESEARCHED_NOT_IMPLEMENTED.map((r) => (
            <div key={r.slug} className="panel-inset p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm text-ink">{r.name}</span>
                <code className="font-mono text-[11px] text-dim">{r.endpoint}</code>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{r.reason}</p>
            </div>
          ))}
        </div>
      </section>

      {runs.length > 0 ? (
        <section className="panel overflow-hidden">
          <div className="border-b border-hairline px-4 py-3">
            <Eyebrow>Recent syncs</Eyebrow>
          </div>
          {runs.map((r) => (
            <div key={r.id} className="border-t border-hairline px-4 py-3 first:border-t-0">
              <div className="flex flex-wrap items-center gap-3">
                <Chip tone={r.status === "ok" ? "positive" : r.status === "failed" ? "negative" : "caution"}>
                  {r.status}
                </Chip>
                <span className="text-sm text-ink">{r.toolSlug}</span>
                <span className="num text-xs text-dim">{r.rowsWritten} rows</span>
                <span className="num ml-auto text-xs text-dim">{new Date(r.startedAt).toUTCString()}</span>
              </div>
              {r.sourceEndpoint ? (
                <code className="mt-1.5 block font-mono text-[11px] text-dim">{r.sourceEndpoint}</code>
              ) : null}
              {r.caveat ? <p className="mt-1.5 text-xs text-caution">{r.caveat}</p> : null}
              {r.error ? <p className="mt-1.5 text-xs text-negative">{r.error}</p> : null}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
