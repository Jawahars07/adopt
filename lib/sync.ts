import { decryptSecret, isEncryptionConfigured, scrubError } from "./crypto";
import { getConnector, type SeatActivity } from "./connectors";
import { db, isDbConfigured } from "./db";
import type { ToolSlug } from "./catalog";

/**
 * Sync orchestration.
 *
 * Pulls real seat activity from a vendor and writes it into
 * tool_usage_monthly with source='api', so the Stack page can distinguish a
 * measured figure from a seeded one.
 *
 * Every attempt writes a sync_runs row whether it succeeds or not, including
 * the endpoint it used and any caveat the connector raised. A number on a CIO's
 * screen needs a provenance story; without one Adopt is as unaccountable as the
 * vendor dashboards it argues against.
 */

export type SyncOutcome = {
  toolSlug: ToolSlug;
  status: "ok" | "partial" | "failed" | "skipped";
  rowsWritten: number;
  sourceEndpoint: string | null;
  caveat: string | null;
  error: string | null;
};

function runId(): string {
  return `sync-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Persist normalised rows. Idempotent: re-syncing a month overwrites it. */
async function writeUsage(orgId: string, rows: SeatActivity[]): Promise<number> {
  const sql = db();
  let written = 0;
  for (const r of rows) {
    // Defensive: a connector bug that reported more active than licensed seats
    // would render a negative idle count and a nonsensical euro figure. The
    // schema check constraint would reject it; catching it here gives a clear
    // error instead of a constraint violation.
    if (r.activeSeats > r.licensedSeats) {
      throw new Error(
        `${r.toolSlug}: active seats (${r.activeSeats}) exceed licensed (${r.licensedSeats}) for ${r.month}.`,
      );
    }
    await sql`
      insert into tool_usage_monthly (org_id, tool_slug, month, licensed_seats, active_seats, source)
      values (${orgId}, ${r.toolSlug}, ${r.month}, ${r.licensedSeats}, ${r.activeSeats}, 'api')
      on conflict (org_id, tool_slug, month) do update
        set licensed_seats = excluded.licensed_seats,
            active_seats  = excluded.active_seats,
            source        = 'api'
    `;
    written += 1;
  }
  return written;
}

/** Sync one tool for one organisation. */
export async function syncConnection(orgId: string, toolSlug: ToolSlug, lookbackDays = 30): Promise<SyncOutcome> {
  const base: SyncOutcome = {
    toolSlug, status: "skipped", rowsWritten: 0, sourceEndpoint: null, caveat: null, error: null,
  };

  if (!isDbConfigured()) return { ...base, status: "failed", error: "No database configured." };
  if (!isEncryptionConfigured()) {
    return { ...base, status: "failed", error: "ADOPT_ENCRYPTION_KEY is not set, so stored credentials cannot be read." };
  }

  const connector = getConnector(toolSlug);
  if (!connector) return { ...base, error: `No connector for ${toolSlug}.` };

  const sql = db();
  const rows = (await sql`
    select config, secret_cipher, status from connections
    where org_id = ${orgId} and tool_slug = ${toolSlug} limit 1
  `) as { config: Record<string, string>; secret_cipher: string | null; status: string }[];

  if (!rows.length || rows[0].status === "disabled") return base;
  const conn = rows[0];

  const id = runId();
  await sql`
    insert into sync_runs (id, org_id, tool_slug, status) values (${id}, ${orgId}, ${toolSlug}, 'running')
  `;

  try {
    const secrets: Record<string, string> = conn.secret_cipher
      ? JSON.parse(decryptSecret(conn.secret_cipher))
      : {};

    const result = await connector.fetch({ config: conn.config ?? {}, secrets, lookbackDays });
    const written = await writeUsage(orgId, result.rows);
    const status = result.caveat ? "partial" : "ok";

    await sql`
      update sync_runs set finished_at = now(), status = ${status}, rows_written = ${written},
                           source_endpoint = ${result.sourceEndpoint}, caveat = ${result.caveat}
      where id = ${id}
    `;
    await sql`
      update connections set status = 'ready', last_error = null, last_synced_at = now()
      where org_id = ${orgId} and tool_slug = ${toolSlug}
    `;

    return {
      toolSlug, status, rowsWritten: written,
      sourceEndpoint: result.sourceEndpoint, caveat: result.caveat, error: null,
    };
  } catch (err) {
    // Scrub before persisting: vendor errors echo tokens back more often than
    // they should, and this string is written to the database and shown in the UI.
    const message = scrubError(err instanceof Error ? err.message : String(err));
    await sql`
      update sync_runs set finished_at = now(), status = 'failed', error = ${message} where id = ${id}
    `;
    await sql`
      update connections set status = 'error', last_error = ${message}
      where org_id = ${orgId} and tool_slug = ${toolSlug}
    `;
    return { ...base, status: "failed", error: message };
  }
}

/** Sync every configured connector for an organisation. */
export async function syncAll(orgId: string, lookbackDays = 30): Promise<SyncOutcome[]> {
  if (!isDbConfigured()) return [];
  const sql = db();
  const rows = (await sql`
    select tool_slug from connections where org_id = ${orgId} and status <> 'disabled'
  `) as { tool_slug: ToolSlug }[];

  // Sequential on purpose. These are admin APIs with per-organisation rate
  // limits (Anthropic documents 100 req/min), and a parallel fan-out across
  // paginated connectors is a good way to get a tenant throttled.
  const out: SyncOutcome[] = [];
  for (const r of rows) out.push(await syncConnection(orgId, r.tool_slug, lookbackDays));
  return out;
}
