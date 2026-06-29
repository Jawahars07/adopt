# Adopt — GenAI Adoption Companion 🧭

Turn an everyday work task into a **qualified GenAI use case**: a fit score, the right
Microsoft 365 Copilot tool, a ready-to-paste prompt, a plain-language adoption guide,
and feedback that rolls up into an **adoption dashboard**.

Built to mirror the real loop of driving GenAI adoption inside a large organisation:
**identify → qualify → enable → adopt → measure → learn.**

> Works with **no API key** out of the box (offline demo engine), so you can try the
> full flow instantly. Add an Anthropic key for live model analysis.

## What makes it defensible (not just an AI wrapper)

A single LLM call is replicable by anyone in an afternoon. Adopt's value is a
**data flywheel** — a stateful system that gets better from real usage, which a
stateless chat prompt structurally cannot do:

| Mechanism | What it does |
|-----------|--------------|
| 🧠 **Living Playbook** | Every qualified task + its feedback becomes a reusable entry, ranked by real adoption success. See `/playbook`. |
| 🔁 **Feedback-weighted retrieval** | New tasks retrieve the *proven* plays colleagues actually adopted and rated highly — recommendations improve automatically as data grows (`lib/playbook.ts`). |
| ⚙️ **Evaluator–Optimizer** | When a prompt is rated poorly, the system critiques and **rewrites it on its own** (`/api/improve`) — the [evaluator-optimizer pattern](https://www.agentpatterns.ai/agent-design/evaluator-optimizer/). |

> *"Copy the code in an afternoon; you can't copy the year of adoption data it learns from."*
> The flywheel is the [only AI moat that compounds](https://www.startups.com/lexicon/data-flywheel).

**Scaling note:** persistence is client-side (`localStorage`) so the demo runs free and
private. The documented upgrade to make the flywheel *org-wide* is a one-component swap:
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
└── lib/
    ├── demo.ts               # offline heuristic engine (no key needed)
    └── types.ts
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

---

Built by [Jawahar Naidu](https://github.com/Jawahars07) · MIT licensed
