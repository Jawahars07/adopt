# Adopt — GenAI Adoption Companion 🧭

Turn an everyday work task into a **qualified GenAI use case**: a fit score, the right
Microsoft 365 Copilot tool, a ready-to-paste prompt, a plain-language adoption guide,
and feedback that rolls up into an **adoption dashboard**.

Built to mirror the real loop of driving GenAI adoption inside a large organisation:
**identify → qualify → enable → adopt → measure.**

> Works with **no API key** out of the box (offline demo engine), so you can try the
> full flow instantly. Add an Anthropic key for live model analysis.

## What it does

| Step | In the app | The adoption job it maps to |
|------|------------|------------------------------|
| **Qualify** | Scores GenAI fit (0–100), impact vs. effort, and flags sensitive-data risk | Use-case identification & qualification with real users |
| **Recommend** | Picks the right surface — Copilot in Outlook / Teams / Word / Excel / PowerPoint, or a Copilot Studio agent | Designing & deploying GenAI assistants and agents |
| **Enable** | Generates a step-by-step guide for non-technical users + a ready-to-paste prompt | Adoption content (guides, demos, tutorials) & upskilling |
| **Measure** | Captures rating, "adopted?", and pain points → dashboard with adoption rate and top blockers | Capturing feedback, usage pain points, improvement opportunities |

## Stack

- **Next.js 14** (App Router) · **React 18** · **TypeScript** · **Tailwind CSS**
- **Anthropic Claude** API (`@anthropic-ai/sdk`) with a graceful **offline demo fallback**
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

A single structured call (default `claude-sonnet-4-6`) returns a JSON adoption package.
The system prompt forces honesty — poor-fit tasks score low, and sensitive-data tasks are
flagged with a caution and a reduced score. If the key is missing or the call fails, the
app falls back to the offline heuristic so the experience never breaks.

---

Built by [Jawahar Naidu](https://github.com/Jawahars07) · MIT licensed
