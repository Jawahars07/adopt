import { neon, neonConfig } from "@neondatabase/serverless";

/**
 * Pin the HTTP endpoint to the connection hostname.
 *
 * The driver's default rewrites the FIRST hostname label to "api." — for
 * `ep-xxx.eu-central-1.aws.neon.tech` that yields `api.eu-central-1...`, which
 * is a real host. Newer Neon connection strings carry a compute segment
 * (`ep-xxx.c-6.eu-central-1...`), and the same rewrite yields
 * `api.c-6.eu-central-1...`, which resolves intermittently and then stops:
 * observed working for several hours, then ENOTFOUND, taking every query with it.
 *
 * I initially diagnosed the first failure as a free-tier cold start and
 * declined to add this override on the grounds that it would be a permanent
 * workaround for a transient fault. That was wrong. The cold start was real and
 * coincidental; the rewrite is the actual defect.
 *
 * Posting to the connection host itself is what the vendor's own service
 * answers — verified returning 200 with real rows on both the direct and pooled
 * hostnames. tests/contract.mjs guards it.
 */
neonConfig.fetchEndpoint = (host) => `https://${host}/sql`;

/**
 * Database access. Everything goes through here — no component or route imports
 * the Neon driver directly. (CONVENTIONS.md)
 *
 * Adopt runs with or without a database. With DATABASE_URL set it persists to
 * Neon Postgres; without it, it runs the seeded demo organisation from memory so
 * the product is never a dead page waiting on infrastructure. The UI says which
 * mode it is in rather than letting seeded numbers pass as real ones.
 */

let client: ReturnType<typeof neon> | null = null;

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * The tagged-template client. Values interpolated into the template are sent as
 * bound parameters, never concatenated into SQL:
 *
 *   sql`select * from orgs where slug = ${slug}`
 *
 * Building a query string by concatenation is the one thing this must never do.
 */
export function db() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Call isDbConfigured() before db().");
  }
  if (!client) client = neon(process.env.DATABASE_URL);
  return client;
}

/** Cheap liveness probe for the health surface. */
export async function ping(): Promise<{ ok: boolean; detail: string }> {
  if (!isDbConfigured()) return { ok: false, detail: "DATABASE_URL not set" };
  try {
    const rows = (await db()`select 1 as ok`) as { ok: number }[];
    return { ok: rows?.[0]?.ok === 1, detail: "connected" };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message.slice(0, 160) : "unknown error" };
  }
}
