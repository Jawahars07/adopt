import type { ToolSlug } from "../catalog";

/**
 * The connector contract.
 *
 * Adopt's Stack surface argues that a seat is idle. That argument is only worth
 * making if the seat figure came from the vendor's own admin API rather than an
 * estimate, so every connector must say exactly where its numbers came from and
 * flag anything it derived rather than measured.
 *
 * DESIGN RULE, and the reason this file exists at all: each connector splits
 * into a thin `fetch` (HTTP, untestable without a live tenant) and a pure
 * `normalise` (fully tested against recorded fixtures). When a vendor changes a
 * response shape the failure shows up in a unit test rather than in a CIO's
 * quarterly review.
 */

/** One month of seat activity for one tool, normalised across every vendor. */
export type SeatActivity = {
  toolSlug: ToolSlug;
  /** First day of the month, YYYY-MM-DD. */
  month: string;
  licensedSeats: number;
  activeSeats: number;
};

export type ConnectorResult = {
  rows: SeatActivity[];
  /** The documented endpoint the data came from, quoted verbatim for the audit trail. */
  sourceEndpoint: string;
  /**
   * Set when the connector could not measure something directly and derived it.
   * Surfaced in the UI. A derived number presented as a measured one is exactly
   * the dishonesty this product exists to correct.
   */
  caveat: string | null;
};

export type CredentialField = {
  key: string;
  label: string;
  /** Secret fields are encrypted at rest and never returned to the browser. */
  secret: boolean;
  help: string;
};

export type ConnectorInput = {
  /** Non-secret configuration: tenant id, org login, workspace id. */
  config: Record<string, string>;
  /** Decrypted secrets. Never logged, never persisted in plaintext. */
  secrets: Record<string, string>;
  /** How many days back to request, where the vendor allows a choice. */
  lookbackDays?: number;
};

export type Connector = {
  slug: ToolSlug;
  name: string;
  vendor: string;
  /** Vendor documentation, so an admin can check the claims made here. */
  docs: string;
  /** Permission strings quoted from vendor docs, shown before anyone grants them. */
  requiredScopes: string[];
  /** What the admin has to supply. */
  fields: CredentialField[];
  /**
   * Whether this connector's HTTP path has been exercised against a real
   * tenant. False means implemented-to-spec but unproven — stated plainly
   * rather than discovered by a customer.
   */
  verifiedAgainstLiveTenant: boolean;
  fetch(input: ConnectorInput): Promise<ConnectorResult>;
};

// ── Shared helpers ───────────────────────────────────────────────────────────

/** First day of the month containing `date`, as YYYY-MM-DD. */
export function monthBucket(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) throw new Error(`Unparseable date: ${String(date)}`);
  // Built from UTC parts, never toISOString on a local-midnight Date — that
  // reports the previous month in any positive-offset timezone. This exact bug
  // shipped once and mis-stated the Stack page by a whole month.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/** True when `date` falls within `days` before `reference`. */
export function isWithinDays(date: string | null | undefined, days: number, reference: Date): boolean {
  if (!date) return false;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  const ms = reference.getTime() - d.getTime();
  return ms >= 0 && ms <= days * 86_400_000;
}

export class ConnectorError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ConnectorError";
  }
}

/**
 * HTTP with a timeout and bounded retry on transient failures.
 *
 * Retries only 429 and 5xx, with exponential backoff honouring Retry-After.
 * Never retries a 4xx: a bad credential retried three times is three chances to
 * trip a vendor's lockout, not three chances to succeed.
 */
export async function httpJson<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number } = {},
): Promise<T> {
  const { timeoutMs = 30_000, retries = 2, ...rest } = init;
  let lastError = "";

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...rest, signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) return (await res.json()) as T;

      const body = (await res.text()).slice(0, 300);
      if (res.status === 429 || res.status >= 500) {
        lastError = `${res.status} ${res.statusText}: ${body}`;
        if (attempt < retries) {
          const retryAfter = Number(res.headers.get("retry-after"));
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 30_000)
            : 2 ** attempt * 1000;
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
      }
      throw new ConnectorError(`${res.status} ${res.statusText}: ${body}`, res.status);
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof ConnectorError) throw err;
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt >= retries) throw new ConnectorError(lastError);
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
    }
  }
  throw new ConnectorError(lastError || "Request failed.");
}
