import {
  ConnectorError, httpJson, isWithinDays, monthBucket,
  type Connector, type ConnectorInput, type ConnectorResult, type SeatActivity,
} from "./types";

/**
 * GitHub Copilot.
 *
 * Endpoint (verbatim from GitHub Docs, api-version 2026-03-10):
 *   GET /orgs/{org}/copilot/billing/seats
 * Scope: read:org (org level) or manage_billing:copilot.
 *
 * Chosen over the /copilot/metrics/reports/* family deliberately. Those return
 * `download_links` plus a `report_day` — a two-step fetch-then-download — and
 * GitHub has already deprecated one generation of that shape. The billing/seats
 * endpoint answers Adopt's actual question in one call: it is the list of seats
 * being BILLED (licensed) each carrying `last_activity_at` (active). Billed
 * seats is also the number that appears on the invoice, which is the number a
 * CIO will argue with.
 */

export type GitHubSeat = {
  last_activity_at?: string | null;
  last_activity_editor?: string | null;
  pending_cancellation_date?: string | null;
  assignee?: { login?: string } | null;
};

export type GitHubSeatsResponse = { total_seats?: number; seats?: GitHubSeat[] };

/** Pure transform, tested against fixtures. */
export function normaliseGitHubSeats(
  seats: GitHubSeat[],
  totalSeats: number | undefined,
  lookbackDays: number,
  reference = new Date(),
): { rows: SeatActivity[]; caveat: string | null } {
  // Prefer GitHub's own total_seats over the array length: with pagination the
  // array may be a page, and total_seats is the billed figure.
  const licensedSeats = typeof totalSeats === "number" && totalSeats >= 0 ? totalSeats : seats.length;
  const activeSeats = seats.filter((s) => isWithinDays(s.last_activity_at, lookbackDays, reference)).length;

  const pendingCancellation = seats.filter((s) => s.pending_cancellation_date).length;
  const caveats: string[] = [];
  if (licensedSeats > seats.length) {
    caveats.push(
      `Active seats counted from ${seats.length} of ${licensedSeats} billed seats retrieved; the rest were not paginated.`,
    );
  }
  if (pendingCancellation > 0) {
    caveats.push(`${pendingCancellation} seat(s) are pending cancellation and still billed this cycle.`);
  }

  return {
    rows: [{ toolSlug: "github-copilot", month: monthBucket(reference), licensedSeats, activeSeats }],
    caveat: caveats.length ? caveats.join(" ") : null,
  };
}

export const githubConnector: Connector = {
  slug: "github-copilot",
  name: "GitHub Copilot",
  vendor: "GitHub",
  docs: "https://docs.github.com/en/rest/copilot/copilot-user-management",
  requiredScopes: ["read:org", "manage_billing:copilot"],
  fields: [
    { key: "org", label: "Organisation login", secret: false, help: "The org slug, e.g. acme-corp." },
    { key: "token", label: "Access token", secret: true, help: "Fine-grained PAT or classic PAT with read:org. Organisation owners only." },
  ],
  verifiedAgainstLiveTenant: false,

  async fetch({ config, secrets, lookbackDays = 30 }: ConnectorInput): Promise<ConnectorResult> {
    const { org } = config;
    const token = secrets.token;
    if (!org || !token) throw new ConnectorError("GitHub connector needs org and token.");

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    const all: GitHubSeat[] = [];
    let total: number | undefined;
    for (let page = 1; page <= 20; page++) {
      const res = await httpJson<GitHubSeatsResponse>(
        `https://api.github.com/orgs/${encodeURIComponent(org)}/copilot/billing/seats?per_page=100&page=${page}`,
        { headers },
      );
      if (total === undefined) total = res.total_seats;
      const batch = res.seats ?? [];
      all.push(...batch);
      if (batch.length < 100) break;
    }

    const { rows, caveat } = normaliseGitHubSeats(all, total, lookbackDays);
    return { rows, sourceEndpoint: `GET /orgs/${org}/copilot/billing/seats`, caveat };
  },
};
