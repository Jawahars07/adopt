# Adopt — build conventions

Binding rules for this codebase. Read before writing code. These exist because
this build generates a lot of files fast, and the failure mode of that is
invented APIs and drifting names.

## Product shape — what Adopt v2 is

Adopt is a **control plane for an organisation's whole AI stack**, not a Copilot
qualifier. Three surfaces:

| Surface | Who | Job |
|---------|-----|-----|
| **Route** | any employee | Describe a task, get the right tool *from the stack the org already pays for*, with a ready prompt and a data-sensitivity check. Says honestly when nothing fits. |
| **Ledger** | AI CoE / IT lead | Adoption and abandonment evidence per use-case pattern. Verdicts: scale, fix, **migrate A→B**, stop. |
| **Stack** | CIO / procurement | Seat economics. Which tools earn their seats, where coverage overlaps, how many seats are reclaimable and what that is worth. |

**Shadow-AI capture is a first-class input, not a side feature.** When a person
says no licensed tool fit, Adopt records what they used instead. That is the
highest-value datum in the system — it is simultaneously a risk signal and a
procurement signal.

## The one non-negotiable: no invented facts

- Seat prices, vendor capabilities and plan names in `lib/catalog.ts` must be
  **plausible and clearly marked as illustrative**, never presented as verified
  vendor pricing. The catalog carries `pricingNote: "illustrative"`.
- The seeded organisation is **synthetic**. Every surface that shows seeded data
  must be reachable from a visible "Demo workspace" marker. Never let a seeded
  number read as real telemetry.
- Research statistics quoted in UI copy must carry their source inline.

## Naming and types

- Single source of truth for domain types: **`lib/types.ts`**. Never redeclare a
  domain shape in a component or a route.
- Tool identifiers are stable slugs: `copilot-m365`, `chatgpt-enterprise`,
  `claude-enterprise`, `gemini-workspace`, `slack-ai`, `notion-ai`, `cursor`,
  `glean`, `github-copilot`. Never a display name as a key.
- Task categories are a closed enum in `lib/catalog.ts` (`TaskCategory`). Adding
  one means adding it there first, then everywhere else.
- Verdict kinds: `scale` | `fix` | `migrate` | `cut` | `watch`. `migrate` and
  `cut` are new in v2; `kill` from v1 is renamed `cut`.

## Database

- **Neon Postgres** over `@neondatabase/serverless` (HTTP driver). No ORM — raw
  parameterised SQL, consistent with this repo's no-vendor-SDK stance.
- All access goes through **`lib/db.ts`**. Components and routes never import
  `@neondatabase/serverless` directly.
- Every query uses the tagged-template form so values are parameterised:
  `sql\`select * from tools where slug = ${slug}\`` — **never** string
  concatenation into SQL.
- Schema lives in `db/schema.sql`, seeds in `db/seed.mjs`. Both are idempotent:
  re-running must not duplicate rows.
- `lib/db.ts` exports `isDbConfigured(): boolean`. When false the app runs in
  **demo-memory mode** from the same seed fixtures, so it never hard-fails
  without a database. Say so in the UI.

## Security — inherited from v1, still binding

- Every request body goes through `lib/guard.ts`. Never `as SomeType` on input.
- Anything user-supplied that reaches a model prompt is sanitised and fenced.
- Rate limits on any route that can call a model.
- No secret in client code. `DATABASE_URL` is server-only; never `NEXT_PUBLIC_`.
- `npm run test:security` must stay green.

## UI

- Design tokens live in **`app/globals.css`** as CSS custom properties on
  `:root`. Never hardcode a hex in a component.
- Tailwind maps to those tokens via `tailwind.config.ts`. Use the semantic name
  (`bg-surface`, `text-muted`, `text-signal`), never `bg-[#14171D]`.
- Numeric data uses the mono face with **tabular figures** (`font-mono
  tabular-nums`). A ledger whose columns don't align is not a ledger.
- Verdict colour is semantic and fixed: scale=positive, fix/migrate=caution,
  cut=negative, watch=neutral. Never restyle per component.
- Progressive disclosure, three tiers: **Summary → Context → Details**. The
  default view shows the decision; evidence expands on demand.
- Every surface needs a real empty state that tells the person what to do next.

## Don'ts, learned the hard way

1. **Never write `\uXXXX` escapes through a file-writing tool.** They land as
   literal control bytes and break the parser. Build such strings with
   `String.fromCharCode`, or write via a python heredoc with doubled backslashes.
2. **A clean `next build` does not mean the app works.** Any change touching CSP,
   rendering mode or hydration must be verified in a real browser before it is
   called done.
3. **Never increment an aggregate on an event.** Derive it from stored rows, so
   replaying feedback is idempotent. (v1 counted one use case three times.)
4. Never invent a Next.js, Neon or Tailwind API. Check the installed version.
