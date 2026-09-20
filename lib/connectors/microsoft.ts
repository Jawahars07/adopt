import {
  ConnectorError,
  httpJson,
  isWithinDays,
  monthBucket,
  type Connector,
  type ConnectorInput,
  type ConnectorResult,
  type SeatActivity,
} from "./types";

/**
 * Microsoft 365 Copilot.
 *
 * Endpoint (verbatim from Microsoft Learn):
 *   GET /reports/getMicrosoft365CopilotUsageUserDetail(period='{period}')
 * Documented period values: D7, D30, D90, D180, ALL.
 * Permission: Reports.Read.All (delegated and application; no lower scope exists).
 *
 * The report returns one row per ENABLED user — Microsoft's wording — each
 * carrying the last activity date per Copilot surface. That shape is unusually
 * good for Adopt: licensed seats is the row count, active seats is the rows with
 * recent activity, and both come from the same call.
 *
 * NOTE ON API VERSION: Microsoft's own page carries a forward-looking notice
 * that these reports are moving under a /copilot URL path segment. The beta
 * path below is what is currently documented with a full response schema. When
 * the successor stabilises this is a one-line change, and the endpoint is
 * recorded on every sync run so it is obvious which path produced a number.
 */

const TOKEN_URL = (tenantId: string) =>
  `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;

const REPORT_URL = (period: string) =>
  `https://graph.microsoft.com/beta/reports/getMicrosoft365CopilotUsageUserDetail(period='${period}')?$format=application/json`;

/** The raw row shape, exactly as the documented example returns it. */
export type GraphCopilotUserRow = {
  reportRefreshDate?: string;
  userPrincipalName?: string;
  displayName?: string;
  lastActivityDate?: string;
  copilotChatLastActivityDate?: string;
  microsoftTeamsCopilotLastActivityDate?: string;
  wordCopilotLastActivityDate?: string;
  excelCopilotLastActivityDate?: string;
  powerPointCopilotLastActivityDate?: string;
  outlookCopilotLastActivityDate?: string;
  oneNoteCopilotLastActivityDate?: string;
  loopCopilotLastActivityDate?: string;
};

/** Documented period values. Anything else is rejected rather than guessed at. */
export function periodFor(lookbackDays: number): "D7" | "D30" | "D90" | "D180" {
  if (lookbackDays <= 7) return "D7";
  if (lookbackDays <= 30) return "D30";
  if (lookbackDays <= 90) return "D90";
  return "D180";
}

const PERIOD_DAYS: Record<string, number> = { D7: 7, D30: 30, D90: 90, D180: 180 };

/**
 * Pure transform: Graph rows to normalised seat activity.
 *
 * Exported and tested independently of the network, because this is where a
 * silent vendor change would corrupt the Stack page.
 */
export function normaliseGraphRows(
  rows: GraphCopilotUserRow[],
  period: keyof typeof PERIOD_DAYS,
): { rows: SeatActivity[]; caveat: string | null } {
  if (rows.length === 0) {
    return {
      rows: [],
      caveat: "Graph returned no Copilot users. Either no seats are assigned, or the report has not populated yet.",
    };
  }

  const days = PERIOD_DAYS[period] ?? 30;

  // Anchor on the report's own refresh date, not on today. Microsoft's usage
  // reports lag by a day or two, and bucketing against wall-clock time would
  // drop a whole month's row at the turn of a month.
  const refresh = rows.find((r) => r.reportRefreshDate)?.reportRefreshDate;
  const reference = refresh ? new Date(refresh) : new Date();
  if (Number.isNaN(reference.getTime())) {
    throw new ConnectorError(`Graph returned an unparseable reportRefreshDate: ${String(refresh)}`);
  }

  // Every returned row is an enabled (licensed) user; a row with activity in the
  // window is an active seat. Per-surface dates are considered too, because a
  // user active only in Excel Copilot may have an empty top-level lastActivityDate.
  const licensedSeats = rows.length;
  const activeSeats = rows.filter((r) =>
    [
      r.lastActivityDate,
      r.copilotChatLastActivityDate,
      r.microsoftTeamsCopilotLastActivityDate,
      r.wordCopilotLastActivityDate,
      r.excelCopilotLastActivityDate,
      r.powerPointCopilotLastActivityDate,
      r.outlookCopilotLastActivityDate,
      r.oneNoteCopilotLastActivityDate,
      r.loopCopilotLastActivityDate,
    ].some((d) => isWithinDays(d, days, reference)),
  ).length;

  return {
    rows: [
      {
        toolSlug: "copilot-m365",
        month: monthBucket(reference),
        licensedSeats,
        activeSeats,
      },
    ],
    caveat:
      "Licensed seats is the count of Copilot-enabled users returned by the usage report, which can differ from the billed seat count on the invoice.",
  };
}

/** OAuth2 client credentials against Entra ID. */
async function accessToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const json = await httpJson<{ access_token?: string; error_description?: string }>(
    TOKEN_URL(tenantId),
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
  );
  if (!json.access_token) {
    throw new ConnectorError(json.error_description || "Entra ID returned no access token.");
  }
  return json.access_token;
}

export const microsoftConnector: Connector = {
  slug: "copilot-m365",
  name: "Microsoft 365 Copilot",
  vendor: "Microsoft",
  docs: "https://learn.microsoft.com/en-us/graph/api/reportroot-getmicrosoft365copilotusageuserdetail",
  requiredScopes: ["Reports.Read.All"],
  fields: [
    { key: "tenantId", label: "Directory (tenant) ID", secret: false, help: "From Entra ID > App registrations > Overview." },
    { key: "clientId", label: "Application (client) ID", secret: false, help: "Same Overview page." },
    { key: "clientSecret", label: "Client secret", secret: true, help: "Certificates & secrets > New client secret. Store it here immediately; Entra shows it once." },
  ],
  // Implemented to the documented contract. No Microsoft tenant was available
  // to exercise it, and saying otherwise would be the kind of claim this
  // codebase refuses to make.
  verifiedAgainstLiveTenant: false,

  async fetch({ config, secrets, lookbackDays = 30 }: ConnectorInput): Promise<ConnectorResult> {
    const { tenantId, clientId } = config;
    const clientSecret = secrets.clientSecret;
    if (!tenantId || !clientId || !clientSecret) {
      throw new ConnectorError("Microsoft connector needs tenantId, clientId and clientSecret.");
    }

    const token = await accessToken(tenantId, clientId, clientSecret);
    const period = periodFor(lookbackDays);

    // Follow @odata.nextLink. Capped so a very large tenant cannot spin here
    // forever on a scheduled job.
    const all: GraphCopilotUserRow[] = [];
    let url: string | undefined = REPORT_URL(period);
    let pages = 0;
    while (url && pages < 50) {
      const page: { value?: GraphCopilotUserRow[]; "@odata.nextLink"?: string } = await httpJson(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      all.push(...(page.value ?? []));
      url = page["@odata.nextLink"];
      pages += 1;
    }

    const { rows, caveat } = normaliseGraphRows(all, period);
    return {
      rows,
      sourceEndpoint: `GET /beta/reports/getMicrosoft365CopilotUsageUserDetail(period='${period}')`,
      caveat: pages >= 50 ? `${caveat ?? ""} Pagination stopped at 50 pages.`.trim() : caveat,
    };
  },
};
