# Security posture

Adopt accepts untrusted input and forwards part of it to a language model. That makes
it an LLM application, not just a web app, so this document is organised around the
threats that actually apply — with the verification result for each, not an intention.

Last audited: **2026-09-20**. All results below are from `npm run test:security` against
a production build, plus a scripted browser pass.

---

## The unusual trust boundary

Adopt's flywheel means the **client POSTs its own accumulated playbook** to
`/api/analyze`, and matching entries are interpolated into the model prompt so
recommendations improve with real adoption data.

That is the product's moat and also its sharpest edge: anything in that payload is
attacker-controlled. Until this audit the route did:

```ts
if (Array.isArray(body?.playbook)) learned = body.playbook as PlaybookEntry[];
// ...
`Proven plays:\n${relatedProven.map((p) => `- "${p.pattern}"`).join("\n")}`
```

A cast is not a check. A crafted `pattern` went verbatim into the model's context.
`lib/guard.ts` now sits on that path and validates every field.

---

## Threats and mitigations

| # | Threat | Mitigation | Verified |
|---|--------|-----------|----------|
| **LLM01** | Prompt injection via the client playbook | Field-level validation, instruction-pattern defanging, delimiter fencing with an explicit "data not instructions" preamble, and a system-prompt clause | Injection phrase redacted before reaching the model; role-hijack in `recommendedTool` neutralised |
| **LLM01** | Invisible-character smuggling (zero-width, bidi, NUL) | Stripped in `sanitizeText` — these are invisible to a human reviewing the playbook page but fully visible to the model | Zero-width / bidi / NUL absent from echoed content |
| **LLM01** | Forged retrieval ranking — a fake entry claiming 999/1 adoption to force itself to the top | Numbers clamped; `adoptedCount` can never exceed `totalCount`; `origin` pinned to `"learned"` so only the server's `SEED_PLAYBOOK` may claim seed status | Clamped to 100%; `origin=learned` |
| **LLM05** | Improper output handling — model JSON cast straight to `Analysis`, crashing the UI on a missing `steps` array | `validateAnalysisShape` / `validateImprovementShape` re-derive every field; an unusable shape falls back to the heuristic | Malformed shapes fall back cleanly |
| **LLM10** | Unbounded consumption on a route that calls a paid model | 256 KB body ceiling checked *before* `JSON.parse`; 2 000-char task cap; 60-entry playbook cap; per-IP rate limits | 300 KB body → 400; 50 000-char task truncated; 300-entry playbook capped, returns 200 |
| **DoS / cost** | A single client hammering the LLM routes | `/api/analyze` 15 req/min/IP, `/api/improve` 8 req/min/IP, `Retry-After` on 429 | 17 of 22 blocked; `Retry-After: 60` |
| **XSS** | Injected script execution | Nonce-based CSP with `strict-dynamic`, **no `unsafe-inline` in `script-src`**; React escaping; no `dangerouslySetInnerHTML` anywhere | `script-src` free of `unsafe-inline`; 0 CSP violations in a real browser |
| **Clickjacking** | Framing the app | `frame-ancestors 'none'` + `X-Frame-Options: DENY` | Both present |
| **Transport** | Downgrade | HSTS `max-age=63072000; includeSubDomains; preload` | Present |
| **Info leak** | Framework fingerprinting | `poweredByHeader: false` | `X-Powered-By` absent |
| **Cache leak** | Shared proxy caching a per-user API response | `Cache-Control: no-store` on `/api/*` | Present |
| **Supply chain** | Vulnerable dependencies | Upgraded Next 16.2.9 → 16.3.5, postcss → 8.5.28 | `npm audit`: 6 vulnerabilities (1 critical, 4 high) → **0** |

Secrets: no key is ever hardcoded; `.env*.local` is gitignored; a secret scan over tracked
files returns nothing. All model calls are server-side, so `connect-src 'self'` holds and
the browser never sees a provider key.

---

## Two honest limitations

**1. The in-process rate limiter is not a global guarantee.**
`rateLimit` in `lib/guard.ts` keeps counters in instance memory. On serverless, concurrent
instances each hold their own, so the effective global ceiling is roughly
*(limit × instances)*. It reliably stops one client hammering one instance and it costs
nothing, but it is the inner layer of a defense-in-depth setup, not the boundary.

The authoritative limit belongs at the edge, where it runs before a function is ever
invoked (and Vercel does not bill for WAF-blocked traffic):

**Status: APPLIED 2026-09-20** — rule `rule_rate_limit_adopt_api_0k2kpx`, `/api` prefix, 100 req / 60s
keyed on IP. **Currently in `log` mode**: it observes and throttles nothing, which is the correct first
step before enforcing against real traffic.

```bash
# Note: firewall commands need the team scope explicitly. Without --scope the CLI
# fails with a misleading "The specified token is not valid" — a scope problem, not auth.
vercel firewall rules add "Rate limit Adopt API" \
  --scope <team-slug> \
  --condition '{"type":"path","op":"pre","value":"/api"}' \
  --action rate_limit \
  --rate-limit-window 60 \
  --rate-limit-requests 100 \
  --rate-limit-keys ip \
  --rate-limit-action log \
  --yes
vercel firewall publish --scope <team-slug> --yes
```

Once the dashboard shows the legitimate rate, edit the rule to
`--rate-limit-action deny`. On the Hobby plan `vercel firewall overview` returns 402 because
IP Bypass is Pro-only, but `rules ls` / `rules add` / `publish` work — custom WAF rules are
available on Hobby. Note that WAF counters are **per region**, so N regions can
collectively exceed the configured limit by about N×.

**2. Prompt-injection defense is mitigation, not proof.**
OWASP is explicit that no single technique fully solves LLM01. The layers here —
validation, defanging, fencing, output validation, least privilege (the model has no
tools and no data access) — raise the cost substantially. They do not make injection
impossible. What limits the blast radius is that **the model in Adopt has no capabilities**:
it returns text that is re-validated before display. There is nothing for a successful
injection to *do* beyond producing a bad recommendation.

---

## Cost of the CSP, stated plainly

A real nonce requires per-request rendering, so `app/layout.tsx` sets
`export const dynamic = "force-dynamic"` and static prerendering is given up.

This was a deliberate call, and the first attempt at it **broke the app** — with pages
prerendered, Next never stamped the nonce, `strict-dynamic` voided the `'self'` allowance,
and every script was blocked. The build was clean and the page was dead HTML. It was
caught by a browser test, not by the compiler, which is why the browser pass exists.

The trade is cheap here: these are client components that hydrate and then read their
state from `localStorage`, so a prerender only ever produced an empty shell.

---

## Running the checks

```bash
npm run build && npm start      # in one terminal
npm run test:security           # in another — zero dependencies, pure fetch
```

Current result: **22/22 pass**. The suite is adversarial — it attempts the injection,
the forged stats, the invisible characters, the oversized bodies and the rate-limit
flood, and asserts on the response.

## Reporting

Found something? Open an issue at
[github.com/Jawahars07/adopt](https://github.com/Jawahars07/adopt/issues).
