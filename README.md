# Adopt — AI stack control plane

Most organisations now run several AI tools at once: Copilot and ChatGPT
Enterprise and Claude and Gemini and Slack AI and a coding assistant, bought by
different departments in different quarters. Nobody told anyone which tool does
what, nobody knows which ones earn their seats, and work quietly leaks to
personal accounts.

Adopt is the layer in between. It **routes a task to the right tool in the stack
you already pay for**, **learns from what gets abandoned**, and turns both into
**seat decisions with a euro figure attached**.

**Live:** https://adopt-eight.vercel.app

---

## The problem, in three numbers

| | |
|---|---|
| **60%** of AI users run the same prompt through several tools because nobody told them which to use. 77% use multiple tools weekly; a third use four or more. | [Glean Work AI Institute, 6,000 workers](https://www.businessinsider.com/welcome-age-ai-sprawl-too-many-tools-2026-6) |
| **67%** of US workers use unapproved AI tools. Shadow AI now factors into **43%** of AI-related security incidents, double the year before. | [IBM / UpGuard](https://www.questa-ai.com/privacy-cafe/shadow-ai-the-biggest-data-risk-in-2026) |
| **36%** of ChatGPT Enterprise seats sit unused. 32% for GitHub Copilot, ~40% for M365 Copilot. A 50,000-seat enterprise wastes **$13M a year**. | [Torii / Zylo / Larridin](https://zylo.com/blog/ai-cost) |

These are not three problems. They are one causal chain that nothing currently
instruments: people shadow-use a tool because the sanctioned one was wrong for
their task, and seats go unused because the tool never fit the work those people
actually have.

## Why existing tools cannot close it

The market splits into three camps that do not talk to each other:

- **Governance and security** (CloudEagle, Netskope) finds shadow AI and blocks it.
- **Spend management** (Zylo, Torii) counts dead seats.
- **Enablement** (WalkMe, Whatfix, Lemon Learning) trains people.

None of them connects the employee's task to the right tool, and none feeds that
evidence back into the seat decision. Lemon Learning concedes the gap in [its own
marketing](https://lemonlearning.com/blog/measuring-copilot-adoption-beyond-licences):
usage dashboards *"cannot reveal where users get stuck."*

## The four surfaces

| Surface | Who it is for | What it answers |
|---------|---------------|-----------------|
| **Route** | anyone | "Which of our tools should do this?" — with the reasoning shown, a policy check on the material, and an honest refusal when the stack has nothing good. |
| **Ledger** | AI CoE / IT | "What is the evidence telling us?" — scale, fix, **migrate**, or stop, per tool and task category. |
| **Stack** | CIO / procurement | "What does this cost and what does it return?" — seat utilisation against task adoption, overlap detection, reclaimable seats in euros. |
| **Shadow** | CISO / CoE | "Where is work leaving, and whose fault is that?" — unapproved use recorded as a routing failure with a cause. |

### The verdict that makes it a product

**MIGRATE** is only computable because an organisation runs several tools at
once. When one tool is being abandoned for a category and another *already
licensed* tool is demonstrably winning it, the answer is neither more training
nor abandonment:

> **Migrate** · Microsoft 365 Copilot · Writing and documents
> Copilot holds **18%** adoption across 17 attempts here, while Claude Enterprise
> holds **92%** across 24. You already pay for both.
> **Do next.** Re-route writing and documents to Claude. No procurement needed —
> this is a routing change, not a purchase.

A single-vendor dashboard cannot produce that sentence. It has nothing to
compare against.

### Shadow AI as a buy signal

Every governance product treats unapproved tool use as a violation to detect and
block. Adopt records it as evidence: the person had a real task, the licensed
stack turned them away, and they solved it anyway. The headline number is the
share of shadow use caused by **a gap the organisation created** — no licensed
tool, or one blocked by policy. When that number is high, the remedy is a
purchase order, not a warning email.

That share is *recorded at the moment the router turned someone away*, never
reconstructed afterwards.

## Stack

- **Next.js 16** (App Router) · React 19 · TypeScript · Tailwind
- **Neon Postgres** over `@neondatabase/serverless`. No ORM — parameterised SQL.
  Without `DATABASE_URL` the app runs a seeded demo organisation from memory, and
  says so on screen.
- **Routing is deterministic.** No model call, so it cannot be prompt-injected,
  cannot fail because a provider is down, and every recommendation carries the
  reasons that produced it. A model is used only by `/api/improve`.

```
app/            page.tsx (Route) · ledger · stack · shadow · api/
lib/  catalog.ts     10 tools, capability profiles, task taxonomy
      routing.ts     classification, scoring, gap detection
      analytics.ts   ledger verdicts, seat economics, shadow attribution
      blockers.ts    why work gets abandoned, structural vs fixable
      demo-org.ts    deterministic synthetic organisation
      guard.ts       validation, sanitisation, rate limiting
      db.ts store.ts Postgres, with an in-memory fallback
db/   schema.sql · seed.mjs
tests/ routing.test.ts · security.mjs · e2e.mjs
```

## Run it

```bash
npm install
npm run dev                     # works immediately on seeded demo data

# optional — persist to Postgres
cp .env.example .env.local      # add DATABASE_URL from neon.tech
npm run db:setup                # idempotent: schema + demo organisation
```

## Verification

```bash
npm run test:routing    # 36/36 — classification, policy gates, gap detection
npm run test:security   # 23/23 — adversarial, zero dependencies
npm run test:e2e        # 30/30 — real browser, all four surfaces
```

Security posture is documented in **[SECURITY.md](SECURITY.md)**: nonce-based
CSP with no `unsafe-inline`, per-IP rate limits, input caps checked before
parsing, output validation, and 0 npm vulnerabilities.

## Honesty

Capability scores and seat prices in the catalog are **illustrative figures for
modelling**, not vendor-published pricing — stated in the UI footer and in
`lib/catalog.ts`. The demo organisation is **synthetic**, flagged `is_demo` in
the database, and every surface that renders it carries a visible marker. Seeded
numbers are never presented as measured telemetry.

---

Built by [Jawahar Naidu](https://github.com/Jawahars07) · MIT licensed
