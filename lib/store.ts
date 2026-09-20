import { db, isDbConfigured } from "./db";
import { buildDemoDataset, DEMO_ORG } from "./demo-org";
import type { ShadowRow, UsageRow, UseCaseRow } from "./analytics";
import type { OrgTool } from "./routing";
import type { TaskCategory, ToolSlug } from "./catalog";

/**
 * The repository. One shape in, one shape out, two backends behind it.
 *
 * The demo path is not a stub — it is the same seeded organisation the database
 * gets, held in memory. That keeps the two paths honest: if a surface looks
 * right in demo mode it will look right on Postgres, because the rows are
 * identical.
 */

export type Workspace = {
  org: { id: string; name: string; slug: string; isDemo: boolean; headcount: number };
  stack: OrgTool[];
  usage: UsageRow[];
  useCases: UseCaseRow[];
  shadow: ShadowRow[];
  source: "postgres" | "memory";
};

// ── Memory backend ───────────────────────────────────────────────────────────
//
// Module-level, so writes survive within a server instance and no longer. On
// serverless that means a submission may not be visible to the next request.
// Acceptable for a demo, and stated in the UI rather than hidden.

const seed = buildDemoDataset();
const memUseCases: UseCaseRow[] = seed.useCases.map((u) => ({
  id: u.id,
  category: u.category,
  department: u.department,
  routedTool: u.routedTool,
  gapKind: u.gapKind,
  createdAt: u.createdAt,
  feedback: u.feedback,
}));
const memShadow: ShadowRow[] = seed.shadowEvents.map((s) => ({
  id: s.id,
  category: s.category,
  toolUsed: s.toolUsed,
  reason: s.reason,
  sensitivity: s.sensitivity,
  department: s.department,
  createdAt: s.createdAt,
  gapKind: s.gapKind,
}));

const memStack: OrgTool[] = seed.stack.map((s) => ({
  slug: s.slug,
  seats: s.seats,
  approvedForSensitive: s.approvedForSensitive,
  monthlyPriceEur: s.monthlyPriceEur,
}));

function memoryWorkspace(): Workspace {
  return {
    org: {
      id: DEMO_ORG.id,
      name: DEMO_ORG.name,
      slug: DEMO_ORG.slug,
      isDemo: true,
      headcount: DEMO_ORG.headcount,
    },
    stack: memStack,
    usage: seed.usage,
    useCases: memUseCases,
    shadow: memShadow,
    source: "memory",
  };
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function getWorkspace(slug = DEMO_ORG.slug): Promise<Workspace> {
  if (!isDbConfigured()) return memoryWorkspace();

  const sql = db();
  try {
    const orgs = (await sql`
      select id, name, slug, is_demo, headcount from orgs where slug = ${slug} limit 1
    `) as { id: string; name: string; slug: string; is_demo: boolean; headcount: number }[];
    if (!orgs.length) return memoryWorkspace();
    const org = orgs[0];

    const [stackRows, usageRows, useCaseRows, shadowRows] = await Promise.all([
      sql`select tool_slug, seats, approved_for_sensitive, monthly_price_eur
          from org_tools where org_id = ${org.id} order by seats desc`,
      // month is formatted in SQL rather than in JS on purpose. The driver
      // returns a `date` column as a JS Date at local midnight, so
      // String(d).slice(0,10) yields "Tue Sep 01" and toISOString() can report
      // the previous day in a positive-offset timezone. Both are silent: the
      // first made "Wed Jul 01" sort above "Tue Sep 01" and the Stack page
      // billed July's seat activity as current.
      sql`select tool_slug, to_char(month, 'YYYY-MM-DD') as month,
                 licensed_seats, active_seats
          from tool_usage_monthly where org_id = ${org.id} order by month asc`,
      sql`select u.id, u.category, u.department, u.routed_tool, u.gap_kind, u.created_at,
                 f.adopted, f.rating, f.blocker
          from use_cases u left join feedback f on f.use_case_id = u.id
          where u.org_id = ${org.id} order by u.created_at desc limit 2000`,
      sql`select id, category, tool_used, reason, sensitivity, department, created_at, gap_kind
          from shadow_events where org_id = ${org.id} order by created_at desc limit 2000`,
    ]);

    return {
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        isDemo: org.is_demo,
        headcount: org.headcount ?? 0,
      },
      stack: (stackRows as Record<string, unknown>[]).map((r) => ({
        slug: r.tool_slug as ToolSlug,
        seats: Number(r.seats),
        approvedForSensitive: Boolean(r.approved_for_sensitive),
        monthlyPriceEur: Number(r.monthly_price_eur),
      })),
      usage: (usageRows as Record<string, unknown>[]).map((r) => ({
        toolSlug: r.tool_slug as ToolSlug,
        month: String(r.month),
        licensedSeats: Number(r.licensed_seats),
        activeSeats: Number(r.active_seats),
      })),
      useCases: (useCaseRows as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        category: r.category as TaskCategory,
        department: (r.department as string) ?? null,
        routedTool: (r.routed_tool as ToolSlug) ?? null,
        gapKind: (r.gap_kind as string) ?? null,
        createdAt: new Date(r.created_at as string).toISOString(),
        feedback:
          r.adopted === null || r.adopted === undefined
            ? null
            : {
                adopted: Boolean(r.adopted),
                rating: Number(r.rating ?? 0),
                blocker: (r.blocker as string) ?? null,
              },
      })),
      shadow: (shadowRows as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        category: r.category as TaskCategory,
        toolUsed: String(r.tool_used),
        reason: (r.reason as string) ?? null,
        sensitivity: (r.sensitivity as string) ?? null,
        department: (r.department as string) ?? null,
        createdAt: new Date(r.created_at as string).toISOString(),
        gapKind: (r.gap_kind as string) ?? null,
      })),
      source: "postgres",
    };
  } catch (err) {
    // A database that is configured but unreachable must not take the product
    // down. Fall back to the seeded workspace and let the UI say so.
    console.error("[adopt] database read failed, serving seeded workspace:", err);
    return memoryWorkspace();
  }
}

// ── Writes ───────────────────────────────────────────────────────────────────

export type NewUseCase = {
  id: string;
  orgId: string;
  task: string;
  category: TaskCategory;
  sensitivity: string;
  department: string | null;
  routedTool: ToolSlug | null;
  routedScore: number | null;
  needsOrgContext: boolean;
  gapKind: string | null;
};

export async function createUseCase(uc: NewUseCase): Promise<void> {
  if (!isDbConfigured()) {
    memUseCases.unshift({
      id: uc.id,
      category: uc.category,
      department: uc.department,
      routedTool: uc.routedTool,
      gapKind: uc.gapKind,
      createdAt: new Date().toISOString(),
      feedback: null,
    });
    return;
  }
  await db()`
    insert into use_cases (id, org_id, task, category, sensitivity, department,
                           routed_tool, routed_score, needs_org_context, gap_kind)
    values (${uc.id}, ${uc.orgId}, ${uc.task}, ${uc.category}, ${uc.sensitivity},
            ${uc.department}, ${uc.routedTool}, ${uc.routedScore},
            ${uc.needsOrgContext}, ${uc.gapKind})
    on conflict (id) do nothing
  `;
}

export async function recordFeedback(
  orgId: string,
  useCaseId: string,
  adopted: boolean,
  rating: number | null,
  blocker: string | null,
): Promise<void> {
  if (!isDbConfigured()) {
    const uc = memUseCases.find((u) => u.id === useCaseId);
    if (uc) uc.feedback = { adopted, rating: rating ?? 0, blocker };
    return;
  }
  // One row per use case, so aggregates stay derivable rather than incremented.
  await db()`
    insert into feedback (use_case_id, adopted, rating, blocker)
    values (${useCaseId}, ${adopted}, ${rating}, ${blocker})
    on conflict (use_case_id)
    do update set adopted = excluded.adopted,
                  rating = excluded.rating,
                  blocker = excluded.blocker,
                  created_at = now()
  `;
}

export async function recordShadowEvent(ev: {
  id: string;
  orgId: string;
  useCaseId: string | null;
  category: TaskCategory;
  toolUsed: string;
  reason: string | null;
  sensitivity: string | null;
  department: string | null;
  gapKind: string | null;
}): Promise<void> {
  if (!isDbConfigured()) {
    memShadow.unshift({
      id: ev.id,
      category: ev.category,
      toolUsed: ev.toolUsed,
      reason: ev.reason,
      sensitivity: ev.sensitivity,
      department: ev.department,
      createdAt: new Date().toISOString(),
      gapKind: ev.gapKind,
    });
    return;
  }
  await db()`
    insert into shadow_events (id, org_id, use_case_id, category, tool_used,
                               reason, sensitivity, department, gap_kind)
    values (${ev.id}, ${ev.orgId}, ${ev.useCaseId}, ${ev.category}, ${ev.toolUsed},
            ${ev.reason}, ${ev.sensitivity}, ${ev.department}, ${ev.gapKind})
    on conflict (id) do nothing
  `;
}
