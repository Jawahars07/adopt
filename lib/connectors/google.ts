import { createSign } from "node:crypto";
import {
  ConnectorError, httpJson, monthBucket,
  type Connector, type ConnectorInput, type ConnectorResult, type SeatActivity,
} from "./types";

/**
 * Gemini for Google Workspace.
 *
 * Endpoint (verbatim from Google for Developers):
 *   GET /admin/reports/v1/activity/users/all/applications/gemini_in_workspace_apps
 * Scope: https://www.googleapis.com/auth/admin.reports.audit.readonly
 * Auth:  service account with domain-wide delegation, impersonating an admin.
 *
 * This is an ACTIVITY log rather than a seat report, so the shape of the answer
 * differs from Microsoft's: active seats are the distinct actors who generated
 * a Gemini event in the window. That is arguably a truer measure of use than a
 * last-login stamp, but it cannot see licensed seats — assignment lives in the
 * Enterprise License Manager API, a separate product surface. Licensed seats
 * therefore come from what the admin entered in Adopt, and the connector says so.
 */

const SCOPE = "https://www.googleapis.com/auth/admin.reports.audit.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ACTIVITY_URL =
  "https://admin.googleapis.com/admin/reports/v1/activity/users/all/applications/gemini_in_workspace_apps";

export type GoogleActivityItem = {
  actor?: { email?: string; profileId?: string };
  id?: { time?: string; uniqueQualifier?: string };
  events?: { name?: string }[];
};

export type GoogleActivityResponse = { items?: GoogleActivityItem[]; nextPageToken?: string };

/**
 * Pure transform, tested against fixtures.
 *
 * `licensedSeatsHint` is what the organisation told Adopt it pays for, since
 * this API cannot report it.
 */
export function normaliseGoogleActivity(
  items: GoogleActivityItem[],
  licensedSeatsHint: number,
  reference = new Date(),
): { rows: SeatActivity[]; caveat: string | null } {
  const actors = new Set<string>();
  for (const it of items) {
    const who = it.actor?.email ?? it.actor?.profileId;
    if (who) actors.add(who.toLowerCase());
  }
  const activeSeats = actors.size;

  // Activity can legitimately exceed a stale seat figure. Reporting more active
  // seats than licensed would render a negative idle count and a nonsensical
  // euro figure, so clamp and flag rather than print an impossible row.
  const clamped = licensedSeatsHint > 0 ? Math.min(activeSeats, licensedSeatsHint) : activeSeats;

  const caveats = [
    "Active seats are distinct users with a Gemini event in the window. Licensed seats come from the figure entered in Adopt — the Reports API does not expose licence assignment.",
  ];
  if (licensedSeatsHint > 0 && activeSeats > licensedSeatsHint) {
    caveats.push(
      `Observed ${activeSeats} active users against ${licensedSeatsHint} licensed seats; the licensed figure looks stale.`,
    );
  }

  return {
    rows: [
      {
        toolSlug: "gemini-workspace",
        month: monthBucket(reference),
        licensedSeats: licensedSeatsHint > 0 ? licensedSeatsHint : activeSeats,
        activeSeats: clamped,
      },
    ],
    caveat: caveats.join(" "),
  };
}

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * Service-account access token via a signed JWT assertion.
 *
 * Implemented on node:crypto rather than googleapis. Pulling a large vendor SDK
 * into a credential path is exactly the supply-chain surface this project keeps
 * refusing, and the assertion flow is about fifteen lines.
 */
async function accessToken(clientEmail: string, privateKey: string, adminEmail: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      exp: now + 3600,
      iat: now,
      // Domain-wide delegation: the service account acts as a real admin.
      sub: adminEmail,
    }),
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  // Keys pasted through a form arrive with escaped newlines; PEM parsing needs real ones.
  const pem = privateKey.includes("\\n") ? privateKey.replace(/\\n/g, "\n") : privateKey;
  let signature: string;
  try {
    signature = b64url(signer.sign(pem));
  } catch {
    throw new ConnectorError("Could not sign with the service account private key. Check it is the full PEM block.");
  }

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: `${header}.${claims}.${signature}`,
  });
  const json = await httpJson<{ access_token?: string; error_description?: string; error?: string }>(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!json.access_token) {
    throw new ConnectorError(json.error_description || json.error || "Google returned no access token.");
  }
  return json.access_token;
}

export const googleConnector: Connector = {
  slug: "gemini-workspace",
  name: "Gemini for Workspace",
  vendor: "Google",
  docs: "https://developers.google.com/workspace/admin/reports/v1/appendix/activity/gemini-in-workspace-apps",
  requiredScopes: [SCOPE],
  fields: [
    { key: "clientEmail", label: "Service account email", secret: false, help: "From the service account JSON key file." },
    { key: "adminEmail", label: "Admin to impersonate", secret: false, help: "A Workspace super admin. Domain-wide delegation must be granted for the scope above." },
    { key: "licensedSeats", label: "Licensed Gemini seats", secret: false, help: "The Reports API cannot report licence assignment, so enter the number you pay for." },
    { key: "privateKey", label: "Service account private key", secret: true, help: "The private_key value from the JSON key file, including the BEGIN and END lines." },
  ],
  verifiedAgainstLiveTenant: false,

  async fetch({ config, secrets, lookbackDays = 30 }: ConnectorInput): Promise<ConnectorResult> {
    const { clientEmail, adminEmail } = config;
    const privateKey = secrets.privateKey;
    if (!clientEmail || !adminEmail || !privateKey) {
      throw new ConnectorError("Google connector needs clientEmail, adminEmail and privateKey.");
    }
    const licensedHint = Number(config.licensedSeats) || 0;

    const token = await accessToken(clientEmail, privateKey, adminEmail);
    const startTime = new Date(Date.now() - lookbackDays * 86_400_000).toISOString();

    const items: GoogleActivityItem[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 50; page++) {
      const url = new URL(ACTIVITY_URL);
      url.searchParams.set("startTime", startTime);
      url.searchParams.set("maxResults", "1000");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const res = await httpJson<GoogleActivityResponse>(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      items.push(...(res.items ?? []));
      if (!res.nextPageToken) break;
      pageToken = res.nextPageToken;
    }

    const { rows, caveat } = normaliseGoogleActivity(items, licensedHint);
    return {
      rows,
      sourceEndpoint: "GET /admin/reports/v1/activity/users/all/applications/gemini_in_workspace_apps",
      caveat,
    };
  },
};
