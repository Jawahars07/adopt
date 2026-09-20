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
  await page.fill("#task", "Review the attached 120 page supplier contract and extract our obligations");
  await page.locator('button[type="submit"]').click();
  await page.waitForSelector("text=Use this", { timeout: 15000 });
  const t = await text();
  check("Routes a long-document task to the long-context specialist", t.includes("Claude Enterprise"), t.slice(0, 120));
  check("Shows its reasoning", t.includes("Rated ") || t.includes("Reaches your own content"));
  check("Shows the honest caveat", t.includes("Where it disappoints"));

  await page.locator('button:has-text("Did not use it")').click();
  await page.waitForTimeout(400);
  const t2 = await text();
  check("Blocker capture appears", t2.toLowerCase().includes("what stopped you"));
  check("Shadow capture appears", t2.toLowerCase().includes("did you use something else"));
  check("Shadow question is non-judgemental", t2.includes("not a compliance check"));
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
