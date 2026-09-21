/**
 * End-to-end browser verification for the four surfaces.
 * Requires a running server and playwright. Run: npm run test:e2e
 */
import { chromium } from "/Users/jawah/Desktop/NewWorld/career-ops/node_modules/playwright/index.mjs";

const BASE = process.env.ADOPT_BASE || "http://localhost:3000";
const checks = [];
const errors = [];
const csp = [];
const check = (name, pass, detail = "") => {
  checks.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (m) => {
  if (m.type() !== "error") return;
  errors.push(m.text());
  if (/Content Security Policy|CSP/i.test(m.text())) csp.push(m.text());
});
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

const text = () => page.evaluate(() => document.body.innerText);
/**
 * Lowercased page text. Labels rendered through .eyebrow are uppercased by CSS
 * and innerText reports the rendered case, so comparing against source casing
 * silently fails. Default to this; use text() only when case genuinely matters.
 */
const ltext = async () => (await text()).toLowerCase();

console.log("\n=== A. SURFACES RENDER UNDER THE NONCE CSP ===");
for (const [path, marker] of [
  ["", "Describe the task"],
  ["stack", "What your AI stack costs"],
  ["ledger", "What the work is telling you"],
  ["shadow", "Work that left the stack"],
]) {
  await page.goto(`${BASE}/${path}`, { waitUntil: "networkidle" });
  const t = await text();
  check(`/${path || ""} renders`, t.includes(marker), t.slice(0, 60));
}
const nonced = await page.evaluate(() => document.querySelectorAll("script[nonce]").length);
check("Scripts carry the CSP nonce", nonced > 0, `${nonced} tags`);

console.log("\n=== B. PROVENANCE IS ALWAYS STATED ===");
for (const path of ["stack", "ledger", "shadow"]) {
  await page.goto(`${BASE}/${path}`, { waitUntil: "networkidle" });
  const t = (await text()).toLowerCase();
  check(`/${path} labels its data source`, t.includes("demo workspace") || t.includes("live workspace"));
}

console.log("\n=== C. STACK SHOWS THE MONEY AND THE VERDICTS ===");
await page.goto(`${BASE}/stack`, { waitUntil: "networkidle" });
{
  const t = await text();
  check("Reclaimable figure present", /€[\d,]{5,}/.test(t));
  check("Per-tool verdicts render", /\bCut\b/.test(t) && /\bScale\b/.test(t));
  check("Overlap analysis present", t.toLowerCase().includes("overlapping coverage"));
  check("Multi-vendor, not Microsoft-only",
    ["Claude", "ChatGPT", "Gemini", "Slack", "Copilot"].every((v) => t.includes(v)));
}

console.log("\n=== D. LEDGER PRODUCES THE MIGRATE VERDICT ===");
await page.goto(`${BASE}/ledger`, { waitUntil: "networkidle" });
{
  const t = await text();
  check("Migrate verdict rendered", t.includes("Migrate"));
  check("Migrate names a destination tool", /Move this work to /.test(t));
  check("Evidence cites both sides", /You already pay for both/.test(t));
  check("Actions are attached", t.includes("Do next."));
  check("Working items collapsed, not cards", t.toLowerCase().includes("already working"));
}

console.log("\n=== E. SHADOW REFRAMES AS A GAP ===");
await page.goto(`${BASE}/shadow`, { waitUntil: "networkidle" });
{
  const t = await text();
  check("Gap-attribution figure present", t.toLowerCase().includes("caused by a gap you created"));
  check("Sensitive count present", t.toLowerCase().includes("sensitive material"));
  // The lede uses the phrase "rather than a policy violation" to draw the
  // contrast deliberately, so a bare keyword search is the wrong test. What
  // matters is that no copy blames the people doing the work.
  check("Frames shadow use as a gap, not misconduct",
    /routing failure/i.test(t) && !/misconduct|reckless|careless|offend/i.test(t));
}

console.log("\n=== F. ROUTE FLOW, END TO END ===");
await page.goto(BASE, { waitUntil: "networkidle" });
{
  // Read the PRIMARY recommendation specifically. Asserting on whole-page text
  // is vacuous here: every alternate is also printed under "ALSO LICENSED", so
  // t.includes("Claude Enterprise") passed even when the primary was Gemini.
  const primaryPanel = () => page.locator("section.panel").filter({ hasText: "Use this" }).first();
  const primaryName = async () => (await primaryPanel().locator("h2").first().innerText()).trim();

  // /api/route-task allows 30 POSTs per minute per IP (route-task/route.ts).
  // tests/security.mjs deliberately burns ~19 of them on rate-limit probes, so
  // running the suites back to back lands here as a 429 — which no selector
  // timeout can wait out, because the recommendation never renders at all.
  // Wait the window out, and if it is something else, say what the page said
  // instead of dying on an opaque timeout.
  async function submitTask(task) {
    await page.fill("#task", task);
    await page.locator('button[type="submit"]').click();
    const rendered = await page
      .waitForSelector("text=Use this", { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    if (rendered) return;

    const body = await text();
    if (/too many requests/i.test(body)) {
      console.log("  ...rate limited by the previous suite, waiting 61s for the window");
      await page.waitForTimeout(61000);
      await page.locator('button[type="submit"]').click();
      await page.waitForSelector("text=Use this", { timeout: 20000 });
      return;
    }
    throw new Error("Route flow rendered no recommendation. Page said: " + body.slice(0, 300));
  }

  // Case 1: pure long-document work, no company-context wording. The
  // long-context specialist should win on raw capability.
  await submitTask("Review the attached 120 page supplier contract for unusual indemnity clauses");
  check("Long-document work routes to the long-context specialist",
    (await primaryName()).includes("Claude Enterprise"), await primaryName());

  // Case 2: the same task, reworded to need company context. Grounding must now
  // outrank raw capability — this is the whole thesis of the router, and the
  // old assertion could not tell the two cases apart.
  await page.goto(BASE, { waitUntil: "networkidle" });
  await submitTask("Review the attached 120 page supplier contract and extract our obligations");
  // Which tool wins here is evidence-dependent: observed adoption is read from
  // the database and fed into the ranking, and this suite itself writes
  // abandonment rows every time it clicks "Did not use it". Asserting a named
  // winner would be asserting today's data rather than the product's behaviour —
  // it passed for two runs and then inverted. The grounding-beats-raw-capability
  // contrast is pinned deterministically in tests/routing.test.ts section 12,
  // against a controlled stack with no database in the loop.
  //
  // What end-to-end can honestly assert is that the surface stays internally
  // consistent with whatever the engine decided.
  // Scope to the score elements. Scraping "NN/100" out of the page text also
  // catches "Rated 95/100 ... in the catalog" from inside the primary's own
  // reasons, which made this look like the primary was outranked by itself.
  const scores = (await page.locator(".num").allInnerTexts())
    .map((v) => v.trim())
    .filter((v) => /^\d+\/100$/.test(v))
    .map((v) => Number(v.split("/")[0]));
  check("The primary names a licensed tool", (await primaryName()).length > 0, await primaryName());
  check("The primary outranks every alternate it is shown beside",
    scores.length > 1 && scores[0] === Math.max(...scores), scores.join(" > "));

  const t = await text();
  check("Shows its reasoning", t.includes("Rated ") || t.includes("Reaches your own content"));
  check("Shows the honest caveat", t.includes("Where it disappoints"));

  await page.locator('button:has-text("Did not use it")').click();
  await page.waitForTimeout(400);
  const t2 = await text();
  check("Blocker capture appears", t2.toLowerCase().includes("what stopped you"));
  check("Shadow capture appears", t2.toLowerCase().includes("did you use something else"));
  check("Shadow question is non-judgemental", t2.includes("not a compliance check"));
  check("Abandonment is acknowledged as saved without needing a blocker",
    t2.toLowerCase().includes("recorded"));
}

console.log("\n=== G. POLICY GATE IS VISIBLE TO THE USER ===");
await page.goto(BASE, { waitUntil: "networkidle" });
{
  await page.fill("#task", "Summarise these employee performance reviews and salary bands");
  await page.locator('button:text-is("Personal data")').click();
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(2500);
  const t = await text();
  check("Excluded tools are shown, not hidden", t.toLowerCase().includes("excluded by policy"));
  check("Exclusion carries a reason", /Not cleared for/.test(t));
}

console.log("\n=== CONSOLE ===");
check("Zero CSP violations", csp.length === 0, String(csp.length));
check("Zero console errors", errors.length === 0, String(errors.length));
errors.slice(0, 6).forEach((e) => console.log("   - " + e.slice(0, 180)));

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(`\n=== ${checks.length - failed.length}/${checks.length} E2E CHECKS PASS ===`);
process.exit(failed.length ? 1 : 0);
