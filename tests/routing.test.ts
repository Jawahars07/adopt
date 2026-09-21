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

console.log("\n=== 9. UNDECLARED SENSITIVITY ===");
{
  // The person picks "internal" and then describes payroll. The classifier is
  // meant to notice, because the cost of not noticing is personal data in an
  // unapproved tool.
  check("Salary wording raises a warning the user did not declare",
    classify("Draft an email about the salary review for my team").sensitivityWarning);
  check("GDPR wording raises a warning",
    classify("Handle a GDPR subject access request from a customer").sensitivityWarning);
  check("Performance review wording raises a warning",
    classify("Write up the performance review notes for my direct report").sensitivityWarning);

  // Regression guards for the substring bug documented on hasTerm(). Both of
  // these were live defects: "nda" matched inside "agenda", "our" inside
  // "sources", and the second one promoted a 44/100 tool to 62/100 while
  // suppressing a gap warning the user needed to see.
  check("'agenda' does not trigger the NDA signal",
    !classify("Draft the agenda for Monday's stand-up").sensitivityWarning);
  check("'sources' does not grant spurious org context",
    !classify("Find the sources for this market research claim").needsOrgContext);
  check("Genuine org wording is still detected",
    classify("Summarise our Q3 board pack from SharePoint").needsOrgContext);
}

console.log("\n=== 10. SEAT REACH AND POLICY CHANGE THE COVERAGE ANSWER ===");
{
  // The reference stack looks fully covered. It is only covered for the people
  // who actually hold a seat.
  const naive = findCoverageGaps(STACK);
  const byReach = findCoverageGaps(STACK, { headcount: 8800, minSeatShare: 0.4 });
  check("Naive coverage reports no gap", naive.length === 0, naive.join(", "));
  check("Seat reach reveals gaps the naive check missed",
    byReach.length > naive.length, `reach gaps: ${byReach.join(", ")}`);
  check("Code is uncovered once reach is required", byReach.includes("code"),
    `gaps: ${byReach.join(", ")}`);
  check("Email stays covered — Copilot reaches enough staff", !byReach.includes("email"));

  // Boundary: the share test is `< minSeatShare`, so exactly at the line counts.
  const atLine: OrgTool[] = [{ slug: "github-copilot", seats: 4000, approvedForSensitive: true, monthlyPriceEur: 19 }];
  const belowLine: OrgTool[] = [{ slug: "github-copilot", seats: 3999, approvedForSensitive: true, monthlyPriceEur: 19 }];
  check("Exactly at the seat-share threshold counts as reachable",
    !findCoverageGaps(atLine, { headcount: 10000, minSeatShare: 0.4 }).includes("code"));
  check("One seat below the threshold does not",
    findCoverageGaps(belowLine, { headcount: 10000, minSeatShare: 0.4 }).includes("code"));

  // Policy: licensed is not the same as usable for sensitive work.
  const policyStack: OrgTool[] = [
    { slug: "copilot-m365", seats: 500, approvedForSensitive: true, monthlyPriceEur: 28 },
    { slug: "chatgpt-enterprise", seats: 500, approvedForSensitive: false, monthlyPriceEur: 25 },
    { slug: "perplexity-enterprise", seats: 500, approvedForSensitive: false, monthlyPriceEur: 35 },
  ];
  check("On paper this stack covers every category",
    findCoverageGaps(policyStack).length === 0, findCoverageGaps(policyStack).join(", "));
  const sensitiveGaps = findCoverageGaps(policyStack, { requireApproved: true });
  check("For confidential work most of that coverage disappears",
    sensitiveGaps.includes("research") && sensitiveGaps.includes("code") && sensitiveGaps.includes("long-doc"),
    `gaps: ${sensitiveGaps.join(", ")}`);
}

console.log("\n=== 11. DUPLICATE SPECIALISTS ===");
{
  // Two coding assistants overlap in exactly one category, which a >=2 rule
  // misses — and it is the most common redundancy in a real AI stack.
  const twoCoders: OrgTool[] = [
    { slug: "github-copilot", seats: 400, approvedForSensitive: true, monthlyPriceEur: 19 },
    { slug: "cursor", seats: 350, approvedForSensitive: true, monthlyPriceEur: 20 },
  ];
  const dup = findOverlaps(twoCoders);
  check("Two coding assistants are flagged as redundant", dup.length === 1, `got ${dup.length}`);
  check("The redundancy names the shared category", dup[0]?.categories.join(",") === "code",
    dup[0]?.categories.join(",") ?? "none");
  check("The redundancy carries the combined annual bill",
    dup[0]?.combinedAnnualEur === (400 * 19 + 350 * 20) * 12, `got ${dup[0]?.combinedAnnualEur}`);

  // And it must not fire on tools that merely both exist.
  const notDup: OrgTool[] = [
    { slug: "copilot-m365", seats: 100, approvedForSensitive: true, monthlyPriceEur: 28 },
    { slug: "github-copilot", seats: 100, approvedForSensitive: true, monthlyPriceEur: 19 },
  ];
  check("A context engine and a coding assistant are not redundant",
    findOverlaps(notDup).length === 0, findOverlaps(notDup).map((o) => o.categories.join("/")).join(", "));
  check("The reference stack still reports exactly one overlap",
    findOverlaps(STACK).length === 1,
    findOverlaps(STACK).map((o) => `${o.aName}/${o.bName}`).join(", "));
}

console.log("\n=== 12. REAL ORGANISATION SHAPES ===");
{
  // A Google-first company.
  const googleShop: OrgTool[] = [
    { slug: "gemini-workspace", seats: 1200, approvedForSensitive: true, monthlyPriceEur: 22 },
    { slug: "chatgpt-enterprise", seats: 300, approvedForSensitive: false, monthlyPriceEur: 25 },
  ];
  const gmail = route({
    task: "Draft a reply to this Gmail thread from our client",
    sensitivity: "internal",
    stack: googleShop,
  });
  check("Workspace-native mail work routes to Gemini",
    gmail.primary?.slug === "gemini-workspace", `got ${gmail.primary?.slug}`);
  check("Grounding is cited as the reason",
    gmail.primary?.reasons.some((r) => r.includes("your own content")) ?? false);

  // A law firm: long documents, everything confidential.
  const lawFirm: OrgTool[] = [
    { slug: "claude-enterprise", seats: 200, approvedForSensitive: true, monthlyPriceEur: 28 },
    { slug: "chatgpt-enterprise", seats: 200, approvedForSensitive: false, monthlyPriceEur: 25 },
  ];
  const contract = route({
    task: "Review the attached 120 page supplier contract for unusual indemnity clauses",
    sensitivity: "confidential",
    stack: lawFirm,
  });
  check("Confidential long-document work routes to the cleared tool",
    contract.primary?.slug === "claude-enterprise", `got ${contract.primary?.slug}`);
  check("The uncleared tool is excluded, not merely ranked lower",
    contract.excluded.some((e) => e.slug === "chatgpt-enterprise"));
  check("No gap is raised when a cleared tool genuinely fits",
    contract.gap === null, `gap: ${contract.gap?.kind}`);

  // An engineering-only stack asked to do marketing work.
  const engOnly: OrgTool[] = [
    { slug: "github-copilot", seats: 300, approvedForSensitive: true, monthlyPriceEur: 19 },
    { slug: "cursor", seats: 200, approvedForSensitive: true, monthlyPriceEur: 20 },
  ];
  const deck = route({
    task: "Build an investor pitch deck from this quarter's numbers",
    sensitivity: "internal",
    stack: engOnly,
  });
  check("A coding stack asked for slides admits a poor fit",
    deck.gap?.kind === "poor-fit", `gap: ${deck.gap?.kind}`);
  check("The remedy points at a better unlicensed tool with a score",
    (deck.gap?.remedy ?? "").includes("/100"), deck.gap?.remedy ?? "none");
}

console.log("\n=== 13. DETERMINISM AND BOUNDS ===");
{
  const input = {
    task: "Summarise the board pack and list the decisions",
    sensitivity: "internal" as const,
    stack: STACK,
  };
  check("Routing the same input twice gives an identical result",
    JSON.stringify(route(input)) === JSON.stringify(route(input)));

  const r = route({ task: "Draft a policy for our intranet", sensitivity: "internal", stack: STACK });
  const scores = [r.primary, ...r.alternates].filter(Boolean).map((x) => x!.score);
  check("Every score stays within 0-100",
    scores.every((s) => s >= 0 && s <= 100), scores.join(","));

  const zeroSeat = route({
    task: "Refactor this TypeScript function",
    sensitivity: "internal",
    stack: [
      { slug: "github-copilot", seats: 0, approvedForSensitive: true, monthlyPriceEur: 19 },
      { slug: "claude-enterprise", seats: 50, approvedForSensitive: true, monthlyPriceEur: 28 },
    ],
  });
  check("A tool with no seats is excluded with a reason",
    zeroSeat.excluded.some((e) => e.slug === "github-copilot" && e.reason === "No seats licensed."));
  check("A zero-seat tool never becomes the recommendation",
    zeroSeat.primary?.slug === "claude-enterprise", `got ${zeroSeat.primary?.slug}`);

  // Weekly recurrence correctly outranks the artifact noun.
  check("Weekly recurrence is read as an automation candidate",
    classify("Every week I have to compile the same status report").category === "automation",
    classify("Every week I have to compile the same status report").category);

  // KNOWN LIMITATION, pinned deliberately so it cannot drift unnoticed.
  // "every week" sits in BOTH the automation strong-signal list and the
  // recurrence markers, so it scores 3+5; "every month" is only a recurrence
  // marker and scores 5, which a strong artifact noun can outrank. Monthly
  // recurring work therefore classifies by its artifact, not its shape.
  // Fixing it properly means separating "recurring work" from "a recurring
  // event's name" — a design change, not a patch. Flagged, not silently altered.
  check("PINNED: monthly recurrence loses to a strong artifact noun",
    classify("Every month I rebuild the same Excel pivot table for the board").category === "spreadsheet",
    classify("Every month I rebuild the same Excel pivot table for the board").category);
}

console.log(`\n=== ${passed}/${passed + failures.length} ROUTING CHECKS PASS ===`);
if (failures.length) {
  failures.forEach((f) => console.log("  FAILED: " + f));
  process.exit(1);
}
