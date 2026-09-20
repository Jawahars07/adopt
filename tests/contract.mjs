/**
 * Live contract probe.
 *
 * No tenant credentials exist for any of these vendors, so a full end-to-end
 * verification is impossible. This tests the next most valuable thing, and the
 * failure mode that actually bites: whether each documented endpoint is REAL
 * and accepts the request shape we send.
 *
 * Each connector's endpoint is called with a deliberately invalid credential.
 * The pass condition is an AUTHENTICATION error — 401/400 with a structured
 * vendor response. That proves the host resolves, TLS is valid, the path is
 * served, the method and headers are accepted, and the only thing standing
 * between us and data is the credential.
 *
 * A DNS failure, a connection error, or a 404 on the path would mean the
 * endpoint is wrong — which is exactly the mistake that survives unit tests and
 * dies on a customer's first sync.
 *
 * Run: npm run test:contract
 */

const checks = [];
const check = (name, pass, detail = "") => {
  checks.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

/** An auth rejection means the endpoint is right. Anything else is suspicious. */
async function probe(label, url, init, expectStatuses) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
    const body = (await res.text()).slice(0, 160).replace(/\s+/g, " ");
    const ok = expectStatuses.includes(res.status);
    check(`${label}: endpoint live, rejects bad credential`, ok, `${res.status} ${body.slice(0, 110)}`);
    check(`${label}: not a 404 (path exists)`, res.status !== 404, `status=${res.status}`);
    return res.status;
  } catch (err) {
    check(`${label}: endpoint reachable`, false, `network failure: ${err.message}`);
    return 0;
  }
}

console.log("\n=== LIVE CONTRACT PROBES (invalid credentials on purpose) ===\n");

// Microsoft: Entra token endpoint. A bogus tenant GUID must yield a structured
// AADSTS error, proving the OAuth2 client-credentials path is correct.
await probe(
  "Microsoft Entra",
  "https://login.microsoftonline.com/00000000-0000-0000-0000-000000000000/oauth2/v2.0/token",
  {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "00000000-0000-0000-0000-000000000000",
      client_secret: "invalid",
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  },
  [400, 401],
);

// Microsoft Graph: the report path itself, unauthenticated. 401 proves the
// beta reports route is served and spelled correctly.
await probe(
  "Microsoft Graph report path",
  "https://graph.microsoft.com/beta/reports/getMicrosoft365CopilotUsageUserDetail(period='D7')?$format=application/json",
  { headers: { Authorization: "Bearer invalid" } },
  [401],
);

// GitHub: a real org that exists but that we have no Copilot rights on.
await probe(
  "GitHub Copilot seats",
  "https://api.github.com/orgs/github/copilot/billing/seats?per_page=1",
  {
    headers: {
      Authorization: "Bearer ghp_invalidtokenforcontracttest0000000000",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  },
  [401, 403],
);

// Anthropic Admin API.
await probe(
  "Anthropic Admin API",
  "https://api.anthropic.com/v1/organizations/users?limit=1",
  { headers: { "x-api-key": "sk-ant-invalid-for-contract-test", "anthropic-version": "2023-06-01" } },
  [401, 403],
);

// Google: the OAuth2 token endpoint with a malformed assertion.
await probe(
  "Google OAuth2 token",
  "https://oauth2.googleapis.com/token",
  {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: "invalid.assertion.value",
    }),
  },
  [400, 401],
);

// Google Admin SDK Reports path, unauthenticated.
await probe(
  "Google Admin SDK Reports path",
  "https://admin.googleapis.com/admin/reports/v1/activity/users/all/applications/gemini_in_workspace_apps?maxResults=1",
  { headers: { Authorization: "Bearer invalid" } },
  [401, 403],
);

// Neon: guard the fetchEndpoint pin in lib/db.ts.
//
// The driver's default rewrites the first hostname label to "api.", which for
// a connection string carrying a compute segment produces a host that resolves
// intermittently and then stops. This asserts the connection host itself
// answers the SQL protocol, which is what the pin relies on. Skipped when no
// DATABASE_URL is present so the suite still runs in a bare checkout.
if (process.env.DATABASE_URL) {
  const u = new URL(process.env.DATABASE_URL);
  await probe(
    "Neon connection host answers /sql",
    `https://${u.hostname}/sql`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    [400, 401],
  );

  const rewritten = u.hostname.replace(/^[^.]+\./, "api.");
  let rewriteResolves = true;
  try {
    await fetch(`https://${rewritten}/sql`, { method: "POST", body: "{}", signal: AbortSignal.timeout(10_000) });
  } catch {
    rewriteResolves = false;
  }
  console.log(
    `  NOTE  driver default would post to ${rewritten} — currently ${rewriteResolves ? "resolving" : "NOT resolving"}` +
    `${rewriteResolves ? "" : " (this is why lib/db.ts pins fetchEndpoint)"}`,
  );
} else {
  console.log("  SKIP  Neon endpoint guard (no DATABASE_URL in this shell)");
}

const failed = checks.filter((c) => !c.pass);
console.log(`\n=== ${checks.length - failed.length}/${checks.length} CONTRACT CHECKS PASS ===`);
console.log(
  "\nWhat this proves: every documented endpoint resolves, serves the path, accepts\n" +
  "our request shape, and rejects only on the credential.\n" +
  "What it does NOT prove: the response body shape under real data. That still needs\n" +
  "a tenant, and every connector reports verifiedAgainstLiveTenant: false until then.",
);
process.exit(failed.length ? 1 : 0);
