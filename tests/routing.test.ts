/**
 * Routing engine tests.
 *
 * The router decides where work goes and, more importantly, when to admit the
 * stack cannot do the work. Both halves are tested. Deterministic by design, so
 * these assertions are exact rather than approximate.
 *
 * Run: npm run test:routing
 */

import { classify, route, findOverlaps, findCoverageGaps, type OrgTool } from "../lib/routing";
import type { TaskCategory } from "../lib/catalog";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

// A realistic mid-size stack: grounded Microsoft estate, ungrounded frontier
// models, a coding assistant, and chat AI. Deliberately has both overlap and a gap.
const STACK: OrgTool[] = [
  { slug: "copilot-m365", seats: 4200, approvedForSensitive: true, monthlyPriceEur: 28 },
  { slug: "chatgpt-enterprise", seats: 2000, approvedForSensitive: false, monthlyPriceEur: 25 },
  { slug: "claude-enterprise", seats: 1500, approvedForSensitive: true, monthlyPriceEur: 28 },
  { slug: "slack-ai", seats: 3000, approvedForSensitive: false, monthlyPriceEur: 9 },
  { slug: "github-copilot", seats: 400, approvedForSensitive: true, monthlyPriceEur: 19 },
];

console.log("\n=== 1. CLASSIFICATION ===");
{
  const cases: [string, TaskCategory][] = [
    ["Turn my weekly team meeting transcript into action items", "meetings"],
    ["Summarise this long email thread before I reply in Outlook", "email"],
    ["Write a first draft of the remote working policy", "docs"],
    ["Build a slide deck from this project brief", "slides"],
    ["Explain this Excel formula and suggest a pivot table", "spreadsheet"],
    ["Where is the travel expense policy on SharePoint", "knowledge-search"],
    ["Refactor this TypeScript function and add a unit test", "code"],
    ["Competitor benchmark of the European market with sources", "research"],
    ["Review the attached 90 page supplier contract", "long-doc"],
    ["Every week I have to compile the same status report", "automation"],
  ];
  for (const [task, expected] of cases) {
    const c = classify(task);
    check(`"${task.slice(0, 44)}..." -> ${expected}`, c.category === expected, `got ${c.category}`);
  }
}

console.log("\n=== 2. CONFIDENCE IS HONEST ===");
{
  const vague = classify("help me with a thing");
  check("Vague input yields low confidence", vague.confidence <= 0.3, `confidence=${vague.confidence}`);
  const sharp = classify("Summarise the meeting transcript into action items and a recap");
  check("Clear input yields higher confidence", sharp.confidence > vague.confidence,
    `sharp=${sharp.confidence} vague=${vague.confidence}`);
}

console.log("\n=== 3. GROUNDING DRIVES ROUTING ===");
{
  // Needs company context -> a grounded tool must win.
  const grounded = route({
    task: "Summarise my Outlook thread with the client about our renewal",
    sensitivity: "internal",
    stack: STACK,
  });
  check("Org-context task detected", grounded.needsOrgContext);
  check("Grounded tool wins an org-context task",
    grounded.primary?.groundedInOrgData === true, `picked ${grounded.primary?.name}`);

  // No company context, long document -> the ungrounded specialist should win.
  const longDoc = route({
    task: "Review the attached 120 page supplier contract and extract obligations",
    sensitivity: "internal",
    stack: STACK,
  });
  check("Long-doc task routes to the long-context specialist",
    longDoc.primary?.slug === "claude-enterprise", `picked ${longDoc.primary?.name}`);
}

console.log("\n=== 4. POLICY GATE ===");
{
  const sensitive = route({
    task: "Draft a summary of these employee performance reviews",
    sensitivity: "personal-data",
    stack: STACK,
  });
  const excludedSlugs = sensitive.excluded.map((e) => e.slug);
  check("Unapproved tools excluded for personal data",
    excludedSlugs.includes("chatgpt-enterprise") && excludedSlugs.includes("slack-ai"),
    `excluded: ${excludedSlugs.join(", ")}`);
  check("Exclusions are surfaced with reasons, not dropped silently",
    sensitive.excluded.every((e) => e.reason.length > 0));
  check("An approved tool still wins",
    sensitive.primary !== null && ["copilot-m365", "claude-enterprise"].includes(sensitive.primary.slug),
    `picked ${sensitive.primary?.name}`);
}

console.log("\n=== 5. GAP DETECTION — the honest part ===");
{
  // Nothing in this stack does external research well.
  const researchGap = route({
    task: "Competitor benchmark of the European packaging market with citable sources",
    sensitivity: "public",
    stack: [
      { slug: "copilot-m365", seats: 100, approvedForSensitive: true, monthlyPriceEur: 28 },
      { slug: "slack-ai", seats: 100, approvedForSensitive: true, monthlyPriceEur: 9 },
    ],
  });
  check("Weak coverage raises a poor-fit gap", researchGap.gap?.kind === "poor-fit",
    `gap=${researchGap.gap?.kind ?? "none"}`);
  check("Gap names an unlicensed tool that would fit",
    (researchGap.gap?.remedy ?? "").length > 20, researchGap.gap?.remedy ?? "");

  // Everything blocked by policy.
  const blocked = route({
    task: "Summarise these patient records",
    sensitivity: "personal-data",
    stack: [{ slug: "chatgpt-enterprise", seats: 50, approvedForSensitive: false, monthlyPriceEur: 25 }],
  });
  check("All-blocked raises a policy gap", blocked.gap?.kind === "blocked-by-policy",
    `gap=${blocked.gap?.kind ?? "none"}`);
  check("Policy gap refuses to suggest a personal account",
    (blocked.gap?.remedy ?? "").toLowerCase().includes("personal account"));

  // Empty stack.
  const empty = route({ task: "Draft a policy", sensitivity: "internal", stack: [] });
  check("Empty stack raises no-tool-licensed", empty.gap?.kind === "no-tool-licensed");
  check("Empty stack returns no primary", empty.primary === null);
}

console.log("\n=== 6. EVIDENCE OVERRIDES THE CATALOG ===");
{
  const base = route({
    task: "Draft the quarterly business review document",
    sensitivity: "internal",
    stack: STACK,
  });
  const withEvidence = route({
    task: "Draft the quarterly business review document",
    sensitivity: "internal",
    stack: STACK,
    evidence: [
      // Claude is catalog-best for docs, but colleagues abandoned it here.
      { slug: "claude-enterprise", category: "docs", attempts: 20, adopted: 1, avgRating: 1.9 },
      { slug: "copilot-m365", category: "docs", attempts: 18, adopted: 16, avgRating: 4.6 },
    ],
  });
  check("Catalog alone favours the doc specialist", base.primary?.slug === "claude-enterprise",
    `picked ${base.primary?.name}`);
  check("Real abandonment demotes it", withEvidence.primary?.slug === "copilot-m365",
    `picked ${withEvidence.primary?.name}`);
  check("The reason cites observed adoption",
    (withEvidence.primary?.reasons ?? []).some((r) => r.includes("%")),
    (withEvidence.primary?.reasons ?? []).join(" | "));
  check("Evidence below the threshold is ignored",
    route({
      task: "Draft the quarterly business review document",
      sensitivity: "internal",
      stack: STACK,
      evidence: [{ slug: "claude-enterprise", category: "docs", attempts: 2, adopted: 0, avgRating: 1 }],
    }).primary?.slug === "claude-enterprise");
}

console.log("\n=== 7. STACK ANALYSIS ===");
{
  const overlaps = findOverlaps(STACK);
  check("Overlap detected between the two frontier chat tools",
    overlaps.some(
      (o) =>
        (o.a === "chatgpt-enterprise" && o.b === "claude-enterprise") ||
        (o.a === "claude-enterprise" && o.b === "chatgpt-enterprise"),
    ),
    overlaps.map((o) => `${o.aName}/${o.bName}`).join(", ") || "none");
  check("Overlap carries a combined annual cost",
    overlaps.every((o) => o.combinedAnnualEur > 0));

  // The full STACK genuinely has no gaps — ChatGPT covers research, Claude covers
  // long documents, GitHub Copilot covers code. Asserting a gap here would be
  // asserting a bug.
  check("A well-covered stack reports no gaps", findCoverageGaps(STACK).length === 0,
    `gaps: ${findCoverageGaps(STACK).join(", ")}`);

  const thinStack: OrgTool[] = [
    { slug: "copilot-m365", seats: 100, approvedForSensitive: true, monthlyPriceEur: 28 },
    { slug: "slack-ai", seats: 100, approvedForSensitive: true, monthlyPriceEur: 9 },
  ];
  const thinGaps = findCoverageGaps(thinStack);
  check("A Microsoft-only stack reports real gaps",
    thinGaps.includes("research") && thinGaps.includes("code") && thinGaps.includes("long-doc"),
    `gaps: ${thinGaps.join(", ")}`);
  check("No gap claimed for email (Copilot covers it)", !thinGaps.includes("email"));
}

console.log("\n=== 8. REASONS ARE ALWAYS PRESENT ===");
{
  const r = route({ task: "Summarise my meeting notes", sensitivity: "internal", stack: STACK });
  check("Primary carries at least one reason", (r.primary?.reasons.length ?? 0) > 0);
  check("Primary carries an honest caveat", typeof r.primary?.caveat === "string");
  check("Alternates are ranked below primary",
    r.alternates.every((a) => a.score <= (r.primary?.score ?? 0)));
}

console.log(`\n=== ${passed}/${passed + failures.length} ROUTING CHECKS PASS ===`);
if (failures.length) {
  failures.forEach((f) => console.log("  FAILED: " + f));
  process.exit(1);
}
