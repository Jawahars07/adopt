import {
  ConnectorError, httpJson, monthBucket,
  type Connector, type ConnectorInput, type ConnectorResult, type SeatActivity,
} from "./types";

/**
 * Claude (Anthropic).
 *
 * Endpoint (verbatim from the Claude Platform docs):
 *   GET https://api.anthropic.com/v1/organizations/users
 * Auth: Admin API key in the x-api-key header.
 * Rate limit: 100 requests per minute per organisation.
 *
 * HONEST LIMITATION, and the reason this connector reports a caveat on every
 * run: the members endpoint gives a reliable LICENSED seat count, but Anthropic
 * does not document a per-member last-activity field for Claude.ai seats the way
 * Microsoft and GitHub do. Usage reporting exists under
 * /v1/organizations/usage_report/..., documented for Claude Code rather than
 * general Claude.ai seat activity.
 *
 * So this connector measures what it can measure and says so. Adopt's own
 * task-level evidence covers the gap: the Ledger already knows how often Claude
 * was routed to and whether the work stuck, which is a better adoption signal
 * than a login timestamp anyway. Inventing an activity number here would be
 * precisely the dishonesty the Stack page exists to call out.
 */

export type AnthropicUser = {
  id?: string;
  email?: string;
  role?: string;
  added_at?: string;
};

export type AnthropicUsersResponse = {
  data?: AnthropicUser[];
  has_more?: boolean;
  last_id?: string;
};

/** Pure transform, tested against fixtures. */
export function normaliseAnthropicUsers(
  users: AnthropicUser[],
  reference = new Date(),
): { rows: SeatActivity[]; caveat: string | null } {
  const licensedSeats = users.length;
  return {
    rows: [
      {
        toolSlug: "claude-enterprise",
        month: monthBucket(reference),
        // Not measurable from this endpoint. Reported as equal to licensed and
        // flagged, rather than guessed at a plausible-looking fraction.
        licensedSeats,
        activeSeats: licensedSeats,
      },
    ],
    caveat:
      "Licensed seats measured from organisation members. Active seats are NOT measured — Anthropic does not expose a per-member last-activity field for Claude.ai seats, so utilisation for this tool is unreliable. Use the Ledger's task adoption for Claude instead.",
  };
}

export const anthropicConnector: Connector = {
  slug: "claude-enterprise",
  name: "Claude Enterprise",
  vendor: "Anthropic",
  docs: "https://platform.claude.com/docs/en/manage-claude/admin-api",
  requiredScopes: ["Admin API key"],
  fields: [
    { key: "adminKey", label: "Admin API key", secret: true, help: "Console > Settings > Admin keys. Organisation admins only." },
  ],
  verifiedAgainstLiveTenant: false,

  async fetch({ secrets }: ConnectorInput): Promise<ConnectorResult> {
    const adminKey = secrets.adminKey;
    if (!adminKey) throw new ConnectorError("Anthropic connector needs an admin API key.");

    const headers = { "x-api-key": adminKey, "anthropic-version": "2023-06-01" };
    const all: AnthropicUser[] = [];
    let afterId: string | undefined;

    // Cursor pagination, capped. The documented limit is 100 req/min, so 20
    // pages of 100 stays far inside it.
    for (let page = 0; page < 20; page++) {
      const url = new URL("https://api.anthropic.com/v1/organizations/users");
      url.searchParams.set("limit", "100");
      if (afterId) url.searchParams.set("after_id", afterId);
      const res = await httpJson<AnthropicUsersResponse>(url.toString(), { headers });
      all.push(...(res.data ?? []));
      if (!res.has_more || !res.last_id) break;
      afterId = res.last_id;
    }

    const { rows, caveat } = normaliseAnthropicUsers(all);
    return { rows, sourceEndpoint: "GET /v1/organizations/users", caveat };
  },
};
