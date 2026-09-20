-- Adopt v2 schema — Neon Postgres.
--
-- Idempotent by contract (CONVENTIONS.md): re-running this file must never
-- duplicate a row or drop data.
--
-- The design point worth noting is the separation of PROVENANCE. Two kinds of
-- number live here and they must never be confused:
--
--   * tool_usage_monthly  — what the VENDOR's admin console reports. Licensed
--     seats and active seats. Every organisation already has this, from the M365
--     admin centre, the ChatGPT Enterprise console, the GitHub billing page.
--     On its own it tells you adoption fell and nothing about why.
--
--   * use_cases / feedback / shadow_events — what ADOPT captures. Task-level
--     evidence: what someone was trying to do, where it was routed, whether it
--     stuck, and what stopped them when it did not.
--
-- Joining those two is the entire product. The first says a seat is idle; the
-- second says the seat is idle because the tool was wrong for the eleven tasks
-- that person actually has.

create table if not exists orgs (
  id           text primary key,
  name         text not null,
  slug         text not null unique,
  -- Synthetic organisations are flagged so the UI can never present seeded
  -- numbers as real telemetry. Non-negotiable, see CONVENTIONS.md.
  is_demo      boolean not null default false,
  -- Used to judge whether a tool's seat count actually reaches the organisation.
  headcount    integer not null default 0,
  created_at   timestamptz not null default now()
);

-- The tools an organisation licenses, with the commercial terms it holds them on.
create table if not exists org_tools (
  org_id                 text not null references orgs(id) on delete cascade,
  tool_slug              text not null,
  seats                  integer not null default 0 check (seats >= 0),
  approved_for_sensitive boolean not null default false,
  monthly_price_eur      numeric(10,2) not null default 0 check (monthly_price_eur >= 0),
  activated_on           date,
  primary key (org_id, tool_slug)
);

-- Vendor-reported seat activity. One row per tool per month.
create table if not exists tool_usage_monthly (
  org_id         text not null references orgs(id) on delete cascade,
  tool_slug      text not null,
  month          date not null,               -- first day of the month
  licensed_seats integer not null check (licensed_seats >= 0),
  active_seats   integer not null check (active_seats >= 0),
  primary key (org_id, tool_slug, month),
  constraint active_not_over_licensed check (active_seats <= licensed_seats)
);

-- A task someone brought to Adopt, and where it was routed.
create table if not exists use_cases (
  id                text primary key,
  org_id            text not null references orgs(id) on delete cascade,
  task              text not null,
  category          text not null,
  sensitivity       text not null,
  department        text,
  routed_tool       text,                     -- null when the stack had no answer
  routed_score      integer,
  needs_org_context boolean not null default false,
  -- Set when routing raised a gap: no-tool-licensed | poor-fit | blocked-by-policy
  gap_kind          text,
  created_at        timestamptz not null default now()
);

create index if not exists use_cases_org_created_idx on use_cases (org_id, created_at desc);
create index if not exists use_cases_tool_category_idx on use_cases (org_id, routed_tool, category);

-- What happened after the person tried it. At most one row per use case, so
-- aggregates stay derivable rather than incremented (the v1 bug).
create table if not exists feedback (
  use_case_id text primary key references use_cases(id) on delete cascade,
  adopted     boolean not null,
  rating      integer check (rating between 1 and 5),
  -- From the fixed taxonomy in lib/blockers.ts. Only meaningful when not adopted.
  blocker     text,
  note        text,
  created_at  timestamptz not null default now()
);

-- Shadow AI, captured rather than merely detected.
--
-- Governance products treat unapproved tool use as a violation to find and
-- block. Adopt treats each event as a routing failure with a cause: the person
-- had a real task, the licensed stack did not serve it, and they solved it
-- anyway. That makes this table simultaneously the risk register and the
-- procurement evidence base.
create table if not exists shadow_events (
  id           text primary key,
  org_id       text not null references orgs(id) on delete cascade,
  use_case_id  text references use_cases(id) on delete set null,
  category     text not null,
  -- Free text: what they reached for. Never constrained to a list we control.
  tool_used    text not null,
  -- Why the licensed stack lost. Same blocker taxonomy where it applies.
  reason       text,
  sensitivity  text,
  department   text,
  -- The gap the router raised at the moment the person was turned away:
  -- no-tool-licensed | poor-fit | blocked-by-policy. Null means routing worked
  -- and the tool still lost, which is preference rather than a gap we created.
  -- Recorded here so the share is observed, never reconstructed afterwards.
  gap_kind     text,
  created_at   timestamptz not null default now()
);

create index if not exists shadow_org_created_idx on shadow_events (org_id, created_at desc);
create index if not exists shadow_org_category_idx on shadow_events (org_id, category);

-- The Living Playbook, now keyed per tool AND category.
--
-- Derived, never incremented: rebuilt from use_cases + feedback so replaying
-- the same evidence yields the same numbers.
create table if not exists patterns (
  org_id        text not null references orgs(id) on delete cascade,
  tool_slug     text not null,
  category      text not null,
  pattern       text not null,
  prompt        text,
  attempts      integer not null default 0,
  adopted_count integer not null default 0,
  avg_rating    numeric(3,2) not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (org_id, tool_slug, category),
  constraint adopted_not_over_attempts check (adopted_count <= attempts)
);
