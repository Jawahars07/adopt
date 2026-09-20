/**
 * Create the schema and load the demo organisation into Neon Postgres.
 *
 * Idempotent (CONVENTIONS.md): running it twice leaves the same rows. Every
 * insert carries an `on conflict` clause, so this is safe to re-run after a
 * schema change or a partial failure.
 *
 *   DATABASE_URL="postgresql://..." npm run db:setup
 *
 * The demo organisation is synthetic and marked `is_demo = true`. Nothing here
 * is measured telemetry, and the UI says so on every surface that renders it.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.\n\nUsage:\n  DATABASE_URL='postgresql://...' npm run db:setup\n");
  process.exit(1);
}

// The generator is TypeScript and is the single source of the demo dataset, so
// compile it rather than maintaining a second copy that can drift.
console.log("Compiling the dataset generator...");
execSync(
  "npx tsc lib/catalog.ts lib/demo-org.ts --module commonjs --target es2022 --moduleResolution node --outDir .tsbuild --skipLibCheck",
  { stdio: "inherit" },
);
const { buildDemoDataset } = await import("../.tsbuild/lib/demo-org.js");

const sql = neon(url);
const data = buildDemoDataset();

console.log("Applying schema...");
// The driver sends one statement per call, so the file is split on the
// statement terminator. Every statement in schema.sql is `create ... if not
// exists`, which is what makes re-running safe.
const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
const statements = schema
  .split(/;\s*$/m)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.split("\n").every((l) => l.trim().startsWith("--")));
for (const stmt of statements) {
  await sql.query(stmt);
}
console.log(`  ${statements.length} statements applied.`);

const org = data.org;

console.log("Seeding organisation...");
await sql`
  insert into orgs (id, name, slug, is_demo, headcount)
  values (${org.id}, ${org.name}, ${org.slug}, true, ${org.headcount})
  on conflict (id) do update set name = excluded.name, headcount = excluded.headcount
`;

console.log(`Seeding ${data.stack.length} licensed tools...`);
for (const t of data.stack) {
  await sql`
    insert into org_tools (org_id, tool_slug, seats, approved_for_sensitive, monthly_price_eur, activated_on)
    values (${org.id}, ${t.slug}, ${t.seats}, ${t.approvedForSensitive}, ${t.monthlyPriceEur}, ${t.activatedOn})
    on conflict (org_id, tool_slug) do update
      set seats = excluded.seats,
          approved_for_sensitive = excluded.approved_for_sensitive,
          monthly_price_eur = excluded.monthly_price_eur
  `;
}

console.log(`Seeding ${data.usage.length} months of vendor-reported seat activity...`);
for (const u of data.usage) {
  await sql`
    insert into tool_usage_monthly (org_id, tool_slug, month, licensed_seats, active_seats)
    values (${org.id}, ${u.toolSlug}, ${u.month}, ${u.licensedSeats}, ${u.activeSeats})
    on conflict (org_id, tool_slug, month) do update
      set licensed_seats = excluded.licensed_seats, active_seats = excluded.active_seats
  `;
}

console.log(`Seeding ${data.useCases.length} use cases and their feedback...`);
for (const uc of data.useCases) {
  await sql`
    insert into use_cases (id, org_id, task, category, sensitivity, department,
                           routed_tool, routed_score, needs_org_context, gap_kind, created_at)
    values (${uc.id}, ${org.id}, ${uc.task}, ${uc.category}, ${uc.sensitivity}, ${uc.department},
            ${uc.routedTool}, ${uc.routedScore}, ${uc.needsOrgContext}, ${uc.gapKind}, ${uc.createdAt})
    on conflict (id) do nothing
  `;
  if (uc.feedback) {
    await sql`
      insert into feedback (use_case_id, adopted, rating, blocker, created_at)
      values (${uc.id}, ${uc.feedback.adopted}, ${uc.feedback.rating}, ${uc.feedback.blocker}, ${uc.createdAt})
      on conflict (use_case_id) do update
        set adopted = excluded.adopted, rating = excluded.rating, blocker = excluded.blocker
    `;
  }
}

console.log(`Seeding ${data.shadowEvents.length} shadow events...`);
for (const ev of data.shadowEvents) {
  await sql`
    insert into shadow_events (id, org_id, use_case_id, category, tool_used,
                               reason, sensitivity, department, gap_kind, created_at)
    values (${ev.id}, ${org.id}, ${ev.useCaseId}, ${ev.category}, ${ev.toolUsed},
            ${ev.reason}, ${ev.sensitivity}, ${ev.department}, ${ev.gapKind}, ${ev.createdAt})
    on conflict (id) do nothing
  `;
}

const [counts] = await sql`
  select
    (select count(*) from orgs) as orgs,
    (select count(*) from org_tools) as tools,
    (select count(*) from tool_usage_monthly) as usage,
    (select count(*) from use_cases) as use_cases,
    (select count(*) from feedback) as feedback,
    (select count(*) from shadow_events) as shadow
`;

console.log("\nDone. Rows in database:");
for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(12)} ${v}`);
console.log(`\nSet DATABASE_URL in .env.local and on Vercel, then the app reads from Postgres.`);
