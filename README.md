# Adopt — GenAI Adoption Companion 🧭

Turn an everyday work task into a **qualified GenAI use case**: a fit score, the right
Microsoft 365 Copilot tool, a ready-to-paste prompt, a plain-language adoption guide,
and feedback that rolls up into an **adoption dashboard**.

Built to mirror the real loop of driving GenAI adoption inside a large organisation:
**identify → qualify → enable → adopt → measure → learn.**

> Works with **no API key** out of the box (offline demo engine), so you can try the
> full flow instantly. Add an Anthropic key for live model analysis.

## What makes it defensible (not just an AI wrapper)

A single LLM call is replicable by anyone in an afternoon. Adopt's value is that it
**learns from rejection** — and that is a position the whole market has left open.

### The gap in the market

Every adoption tool measures the same thing: **usage**. Microsoft's Copilot Dashboard in
Viva Insights, the [Analytics Hub](https://microsoft.github.io/Analytics-Hub/) Power BI
templates and the M365 admin reports all count active users, feature utilisation, licence
utilisation and assisted hours. The digital-adoption platforms — WalkMe, Whatfix, Pendo,
Lemon Learning — layer guided walkthroughs on the same counters. Lemon Learning names the
gap in [its own marketing](https://lemonlearning.com/blog/measuring-copilot-adoption-beyond-licences):
those dashboards *"cannot reveal where users get stuck."*

That gap is where the money goes. 88% of AI pilots never reach production. **40.7% of
organisations cancelled a GenAI assistant rollout in 2026**, up from 31.7% in 2025
([AvePoint](https://www.avepoint.com/blog/strategy-blog/why-ai-pilots-fail)). Gartner has
42% abandoning most AI initiatives. And 84% of failures trace to a *decision*, not to the
technology.

A usage dashboard reports the symptom — the line went down. It cannot say why, because it
never captured a reason, so the only available response is more training and more nudges.

### What Adopt does instead

| Mechanism | What it does |
|-----------|--------------|
| 🧾 **Abandonment Ledger** | Captures **why** a use case was rejected against a fixed blocker taxonomy, then rules on each pattern: **scale it, fix it, or stop.** See `lib/blockers.ts`. |
| 🧠 **Living Playbook** | Every qualified task + its feedback becomes a reusable entry, ranked by real adoption success. See `/playbook`. |
| 🔁 **Feedback-weighted retrieval** | New tasks retrieve the *proven* plays colleagues actually adopted and rated highly (`lib/playbook.ts`). |
| ⚙️ **Evaluator–Optimizer** | A poorly-rated prompt is critiqued and **rewritten automatically** (`/api/improve`) — the [evaluator-optimizer pattern](https://www.agentpatterns.ai/agent-design/evaluator-optimizer/). |

**The split that matters is FIX vs KILL.** Two use cases can have identical adoption rates
and deserve opposite responses: one was abandoned because the prompt was sloppy (fixable),
the other because the data is confidential (structural). A usage dashboard sees one number
and cannot tell them apart. Adopt refuses to offer a prompt rewrite for a structural
blocker, and says so on screen:

> **Stop** — Turn my weekly team meeting notes into clear action items · Copilot in Microsoft Teams
> Only 0/4 adopted (0%), and 100% of the rejections are "I couldn't use it with this data"
> — a property of the task, not of the prompt.
> **Do next:** Governance blocker, not an adoption blocker. Escalate to whoever owns data
> classification — do not push this use case again until the source question is answered.

Recommending **stop** is the point. No vendor whose revenue depends on seat expansion will
ever tell a customer to use less of the product.

**Scaling note:** persistence is client-side (`localStorage`) so the demo runs free and
private. The documented upgrade to make the ledger *org-wide* is a one-component swap:
vector embeddings + a shared store (Vercel KV / Postgres).

## What it does

| Step | In the app | The adoption job it maps to |
|------|------------|------------------------------|
| **Qualify** | Scores GenAI fit (0–100), impact vs. effort, and flags sensitive-data risk | Use-case identification & qualification with real users |
| **Recommend** | Picks the right surface — Copilot in Outlook / Teams / Word / Excel / PowerPoint, or a Copilot Studio agent | Designing & deploying GenAI assistants and agents |
| **Enable** | Generates a step-by-step guide for non-technical users + a ready-to-paste prompt | Adoption content (guides, demos, tutorials) & upskilling |
| **Measure** | Captures rating, "adopted?", and pain points → dashboard with adoption rate and top blockers | Capturing feedback, usage pain points, improvement opportunities |

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript** · **Tailwind CSS**
- **Model-agnostic** — no vendor SDK. A pluggable LLM layer (`lib/llm.ts`) runs on a free
  local model (**Ollama**), any **OpenAI-compatible** endpoint (**Groq free tier**, OpenRouter,
  LM Studio, vLLM), or Claude — all over plain `fetch`. Default is a fully **offline heuristic**.
- Client-side storage (`localStorage`) — no database, deploys anywhere static-ish

```
adopt/
├── app/
│   ├── page.tsx              # intake → qualification → guide → prompt → feedback
│   ├── dashboard/page.tsx    # adoption metrics, top tools, pain points
│   ├── api/analyze/route.ts  # Anthropic call + demo fallback
│   └── layout.tsx, globals.css
│   ├── api/improve/route.ts  # evaluator-optimizer loop
│   └── layout.tsx, globals.css
├── lib/
│   ├── blockers.ts           # blocker taxonomy + scale/fix/kill verdicts
│   ├── guard.ts              # validation, sanitisation, fencing, rate limiting
│   ├── playbook.ts           # retrieval + idempotent playbook rebuild
│   ├── demo.ts               # offline heuristic engine (no key needed)
│   └── types.ts
├── proxy.ts                  # nonce-based CSP
└── tests/security.mjs        # adversarial suite
```

## Run it

```bash
npm install
cp .env.example .env.local     # optional — add ANTHROPIC_API_KEY for live analysis
npm run dev                    # http://localhost:3000
```

No key? It runs in **demo mode** and every result is flagged as such.

## Deploy

One click on **Vercel** — set `ANTHROPIC_API_KEY` as an environment variable (or leave it
unset to ship the demo).

## How the model is used

A single structured call returns a JSON adoption package. The system prompt forces honesty —
poor-fit tasks score low, and sensitive-data tasks are flagged with a reduced score. Set
`LLM_PROVIDER` (see `.env.example`) to choose the backend; with nothing set it runs the
offline heuristic. **Any provider failure falls back to the heuristic**, so it never breaks.

```
LLM_PROVIDER=demo     # offline heuristic (default) — $0, no account, no network
LLM_PROVIDER=ollama   # local model on your machine — free & private
LLM_PROVIDER=openai   # Groq free tier / OpenRouter / LM Studio / OpenAI
LLM_PROVIDER=anthropic# Claude (optional)
```

## Security

Adopt forwards untrusted input to a language model, so it is treated as an LLM
application, not just a web app. Full write-up in **[SECURITY.md](SECURITY.md)**.

- **Prompt injection (OWASP LLM01)** — the client POSTs its own playbook and entries reach
  the model prompt. Every field is validated, instruction-shaped text is defanged, invisible
  characters are stripped, and untrusted content is delimiter-fenced as data.
- **Output handling (LLM05)** — model JSON is re-validated field by field before it reaches
  React, instead of being cast and trusted.
- **Unbounded consumption (LLM10)** — 256 KB body ceiling checked before parsing, input caps,
  and per-IP rate limits on both model routes.
- **Nonce-based CSP** with `strict-dynamic` and **no `unsafe-inline` in `script-src`**, plus
  HSTS, `frame-ancestors 'none'`, and `no-store` on `/api/*`.
- **0 npm vulnerabilities.**

```bash
npm run build && npm start
npm run test:security     # 22/22 — adversarial, zero dependencies
```

The suite actually attacks the app: it attempts the injection, forges adoption stats,
smuggles zero-width characters, posts oversized bodies and floods the rate limiter.

---

Built by [Jawahar Naidu](https://github.com/Jawahars07) · MIT licensed
