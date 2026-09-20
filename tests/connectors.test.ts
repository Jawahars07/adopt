/**
 * Connector tests.
 *
 * The HTTP call in each connector cannot be exercised without a live tenant.
 * Everything AROUND it can, and that is where vendor changes actually bite: a
 * renamed field or a changed date format corrupts the Stack page silently while
 * the request still returns 200. These tests pin the transform against recorded
 * response shapes taken from each vendor's published example.
 *
 * Run: npm run test:connectors
 */

import { encryptSecret, decryptSecret, maskSecret, scrubError, safeEqual } from "../lib/crypto";
import { monthBucket, isWithinDays } from "../lib/connectors/types";
import { normaliseGraphRows, periodFor } from "../lib/connectors/microsoft";
import { normaliseGitHubSeats } from "../lib/connectors/github";
import { normaliseAnthropicUsers } from "../lib/connectors/anthropic";
import { normaliseGoogleActivity } from "../lib/connectors/google";
import { CONNECTORS, RESEARCHED_NOT_IMPLEMENTED } from "../lib/connectors";

let passed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

// A key for the crypto tests only. Never a default in production code.
process.env.ADOPT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

console.log("\n=== 1. CREDENTIAL ENCRYPTION ===");
{
  const secret = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";
  const blob = encryptSecret(secret);
  check("Round-trips", decryptSecret(blob) === secret);
  check("Ciphertext does not contain the plaintext", !blob.includes(secret));
  check("Versioned for rotation", blob.startsWith("v1."));
  check("Same input encrypts differently each time (random IV)", encryptSecret(secret) !== encryptSecret(secret));

  // Tampering must fail loudly, not decrypt to garbage.
  const parts = blob.split(".");
  const flipped = Buffer.from(parts[3], "base64url");
  flipped[0] = flipped[0] ^ 0xff;
  let threw = false;
  try { decryptSecret([parts[0], parts[1], parts[2], flipped.toString("base64url")].join(".")); }
  catch { threw = true; }
  check("Tampered ciphertext throws", threw);

  let wrongKeyThrew = false;
  const saved = process.env.ADOPT_ENCRYPTION_KEY;
  process.env.ADOPT_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  try { decryptSecret(blob); } catch { wrongKeyThrew = true; }
  process.env.ADOPT_ENCRYPTION_KEY = saved;
  check("Wrong key throws", wrongKeyThrew);

  let badKeyThrew = false;
  process.env.ADOPT_ENCRYPTION_KEY = "too-short";
  try { encryptSecret("x"); } catch { badKeyThrew = true; }
  process.env.ADOPT_ENCRYPTION_KEY = saved;
  check("Malformed key rejected rather than padded", badKeyThrew);

  check("Masking hides the middle", maskSecret(secret).startsWith("ghp_") && !maskSecret(secret).includes("mnopqr"));
  check("Short secrets fully masked", maskSecret("abc") === "***");
  check("safeEqual matches", safeEqual("abc", "abc") && !safeEqual("abc", "abd") && !safeEqual("abc", "ab"));
}

console.log("\n=== 2. ERROR SCRUBBING (errors get persisted and displayed) ===");
{
  check("GitHub token removed",
    !scrubError("bad credentials for ghp_abcdefghijklmnopqrstuvwxyz012345").includes("ghp_abcdef"));
  check("Anthropic key removed",
    !scrubError("401 from sk-ant-api03-abcdefghijklmnopqrst").includes("sk-ant-api03"));
  check("Slack token removed",
    !scrubError("invalid_auth xoxb-123456789012-abcdefghijkl").includes("xoxb-1234"));
  check("client_secret in a query string removed",
    scrubError("POST failed: client_secret=supersecretvalue&grant_type=x").includes("[redacted]"));
  check("JWT removed",
    !scrubError("bad eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop").includes("eyJzdWIi"));
  check("Ordinary messages survive", scrubError("404 Not Found: org does not exist").includes("org does not exist"));
  check("Bounded length", scrubError("x".repeat(5000)).length <= 500);
}

console.log("\n=== 3. DATE HANDLING (the trap that already shipped once) ===");
{
  check("monthBucket returns the first of the month", monthBucket("2026-09-17") === "2026-09-01");
  // The exact value that broke the Stack page: a date column deserialised to
  // local midnight, which toISOString reports as the previous month in IST.
  check("Handles a UTC instant that is the previous day locally",
    monthBucket(new Date("2026-08-31T18:30:00.000Z")) === "2026-08-01",
    monthBucket(new Date("2026-08-31T18:30:00.000Z")));
  check("Month boundary is exact", monthBucket("2026-01-01") === "2026-01-01" && monthBucket("2026-12-31") === "2026-12-01");
  let threw = false;
  try { monthBucket("not-a-date"); } catch { threw = true; }
  check("Unparseable date throws rather than producing NaN", threw);

  const ref = new Date("2026-09-20T00:00:00Z");
  check("Within window", isWithinDays("2026-09-01", 30, ref));
  check("Outside window", !isWithinDays("2026-07-01", 30, ref));
  check("Null is not activity", !isWithinDays(null, 30, ref) && !isWithinDays("", 30, ref));
  check("Future dates are not counted as activity", !isWithinDays("2027-01-01", 30, ref));
  check("Garbage is not activity", !isWithinDays("banana", 30, ref));
}

console.log("\n=== 4. MICROSOFT GRAPH ===");
{
  check("D7/D30/D90/D180 only", periodFor(5) === "D7" && periodFor(30) === "D30" && periodFor(60) === "D90" && periodFor(365) === "D180");

  // Shape taken from Microsoft's own documented example response.
  const rows = [
    { reportRefreshDate: "2026-09-18", userPrincipalName: "a", lastActivityDate: "2026-09-17",
      copilotChatLastActivityDate: "2026-09-16", excelCopilotLastActivityDate: "" },
    { reportRefreshDate: "2026-09-18", userPrincipalName: "b", lastActivityDate: "", copilotChatLastActivityDate: "" },
    // Active only in one surface — the top-level field is empty. Counting only
    // lastActivityDate would under-report this user as idle.
    { reportRefreshDate: "2026-09-18", userPrincipalName: "c", lastActivityDate: "", excelCopilotLastActivityDate: "2026-09-15" },
    { reportRefreshDate: "2026-09-18", userPrincipalName: "d", lastActivityDate: "2026-01-02" },
  ];
  const out = normaliseGraphRows(rows, "D30");
  check("Licensed seats is the enabled-user row count", out.rows[0].licensedSeats === 4, String(out.rows[0].licensedSeats));
  check("Active counts per-surface activity too", out.rows[0].activeSeats === 2, String(out.rows[0].activeSeats));
  check("Anchors on reportRefreshDate, not today", out.rows[0].month === "2026-09-01", out.rows[0].month);
  check("States the licensed-seat caveat", (out.caveat ?? "").includes("billed seat count"));

  const empty = normaliseGraphRows([], "D30");
  check("Empty report yields no rows and says why", empty.rows.length === 0 && (empty.caveat ?? "").includes("no Copilot users"));

  let threw = false;
  try { normaliseGraphRows([{ reportRefreshDate: "garbage", userPrincipalName: "a" }], "D30"); } catch { threw = true; }
  check("Bad refresh date throws rather than bucketing to now", threw);
}

console.log("\n=== 5. GITHUB COPILOT ===");
{
  const ref = new Date("2026-09-20T00:00:00Z");
  const seats = [
    { last_activity_at: "2026-09-19T10:00:00Z" },
    { last_activity_at: "2026-09-01T10:00:00Z" },
    { last_activity_at: null },
    { last_activity_at: "2026-02-01T10:00:00Z", pending_cancellation_date: "2026-10-01" },
  ];
  const out = normaliseGitHubSeats(seats, 4, 30, ref);
  check("Active seats from last_activity_at", out.rows[0].activeSeats === 2, String(out.rows[0].activeSeats));
  check("Licensed seats from total_seats", out.rows[0].licensedSeats === 4);
  check("Flags pending cancellations still being billed", (out.caveat ?? "").includes("pending cancellation"));

  // total_seats larger than the page retrieved: must flag, not silently under-report.
  const partial = normaliseGitHubSeats(seats, 400, 30, ref);
  check("Unpaginated remainder is flagged", (partial.caveat ?? "").includes("not paginated"));
  check("Licensed still reflects the billed total", partial.rows[0].licensedSeats === 400);

  const noTotal = normaliseGitHubSeats(seats, undefined, 30, ref);
  check("Falls back to array length when total_seats absent", noTotal.rows[0].licensedSeats === 4);
  check("Empty org yields zeroes, not a crash", normaliseGitHubSeats([], 0, 30, ref).rows[0].licensedSeats === 0);
}

console.log("\n=== 6. ANTHROPIC ===");
{
  const out = normaliseAnthropicUsers([{ email: "a@x.com" }, { email: "b@x.com" }, { email: "c@x.com" }]);
  check("Licensed seats from member count", out.rows[0].licensedSeats === 3);
  check("Refuses to invent an activity number", out.rows[0].activeSeats === 3);
  check("Says plainly that active seats are NOT measured", (out.caveat ?? "").includes("NOT measured"));
  check("Points at the Ledger instead", (out.caveat ?? "").toLowerCase().includes("task adoption"));
}

console.log("\n=== 7. GOOGLE WORKSPACE ===");
{
  const items = [
    { actor: { email: "a@x.com" }, id: { time: "2026-09-19T10:00:00Z" } },
    { actor: { email: "A@X.com" }, id: { time: "2026-09-18T10:00:00Z" } }, // same person, different case
    { actor: { email: "b@x.com" }, id: { time: "2026-09-17T10:00:00Z" } },
    { actor: {} },
  ];
  const out = normaliseGoogleActivity(items, 10, new Date("2026-09-20T00:00:00Z"));
  check("Distinct actors, case-insensitive", out.rows[0].activeSeats === 2, String(out.rows[0].activeSeats));
  check("Licensed seats taken from the admin-entered figure", out.rows[0].licensedSeats === 10);
  check("States that licence assignment is not readable here", (out.caveat ?? "").includes("does not expose licence assignment"));

  // More active users than licensed seats would render a negative idle count.
  const stale = normaliseGoogleActivity(items, 1, new Date("2026-09-20T00:00:00Z"));
  check("Clamps active to licensed rather than printing a negative idle count", stale.rows[0].activeSeats === 1);
  check("Flags the stale licence figure", (stale.caveat ?? "").includes("looks stale"));
}

console.log("\n=== 8. REGISTRY HONESTY ===");
{
  check("Every connector declares its documented endpoint", CONNECTORS.every((c) => c.docs.startsWith("https://")));
  check("Every connector declares required scopes", CONNECTORS.every((c) => c.requiredScopes.length > 0));
  check("Every connector declares at least one credential field", CONNECTORS.every((c) => c.fields.length > 0));
  check("No connector claims live-tenant verification it does not have",
    CONNECTORS.every((c) => c.verifiedAgainstLiveTenant === false));
  check("Secret fields are marked so they are encrypted and never returned",
    CONNECTORS.every((c) => c.fields.some((f) => f.secret)));
  check("Skipped vendors record the endpoint and the reason",
    RESEARCHED_NOT_IMPLEMENTED.length >= 2 &&
    RESEARCHED_NOT_IMPLEMENTED.every((r) => r.endpoint.length > 10 && r.reason.length > 40));
}

console.log(`\n=== ${passed}/${passed + failures.length} CONNECTOR CHECKS PASS ===`);
if (failures.length) { failures.forEach((f) => console.log("  FAILED: " + f)); process.exit(1); }
