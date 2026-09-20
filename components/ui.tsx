import type { ReactNode } from "react";

/**
 * Shared primitives.
 *
 * Verdict colour is semantic and defined once. A "cut" is the same red on every
 * surface, so someone scanning the Stack page and someone scanning the Ledger
 * learn one vocabulary rather than two. (CONVENTIONS.md)
 */

export type Tone = "positive" | "caution" | "negative" | "neutral" | "signal";

const TONE_CLASS: Record<Tone, string> = {
  positive: "bg-positive-wash text-positive",
  caution: "bg-caution-wash text-caution",
  negative: "bg-negative-wash text-negative",
  neutral: "bg-neutral-wash text-muted",
  signal: "bg-signal-wash text-signal",
};

export function Chip({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`chip ${TONE_CLASS[tone]}`}>{children}</span>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="eyebrow">{children}</span>;
}

/** Page header. The title carries the job; the line under it carries the question. */
export function PageHead({
  eyebrow,
  title,
  lede,
  right,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
      <div className="max-w-2xl">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="display mt-1.5 text-3xl font-semibold leading-tight text-ink">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{lede}</p>
      </div>
      {right}
    </div>
  );
}

/**
 * A figure. The display serif does the talking; the label stays quiet.
 * `tone` is used sparingly — if every number is coloured, none of them are.
 */
export function Figure({
  value,
  label,
  sub,
  tone,
}: {
  value: string;
  label: string;
  sub?: string;
  tone?: Tone;
}) {
  const colour =
    tone === "negative" ? "text-negative"
    : tone === "positive" ? "text-positive"
    : tone === "signal" ? "text-signal"
    : "text-ink";
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className={`display mt-1 text-[28px] leading-none ${colour}`}>{value}</div>
      {sub ? <div className="mt-1.5 text-xs text-dim">{sub}</div> : null}
    </div>
  );
}

/**
 * The signature element: a reconciliation bar.
 *
 * Seats paid for, set against seats actually earning. The hatched remainder is
 * the shortfall, drawn rather than described — a balance sheet that does not
 * balance, which is the product's entire argument in one shape.
 */
export function Reconcile({ earned, total }: { earned: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (earned / total) * 100)) : 0;
  return (
    <div
      className="reconcile"
      role="img"
      aria-label={`${Math.round(pct)} percent of seats active, ${total - earned} idle`}
    >
      <div className="reconcile-fill" style={{ width: `${pct}%` }} />
      <div className="reconcile-gap" style={{ width: `${100 - pct}%` }} />
    </div>
  );
}

/** A compact trend. Enough to read direction, not enough to distract. */
export function Spark({ points, tone = "neutral" }: { points: number[]; tone?: Tone }) {
  if (points.length < 2) return <div className="h-5 w-20" />;
  const max = Math.max(...points, 1);
  const stroke =
    tone === "negative" ? "var(--negative)"
    : tone === "positive" ? "var(--positive)"
    : "var(--text-dim)";
  const step = 80 / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(20 - (p / max) * 18).toFixed(1)}`)
    .join(" ");
  return (
    <svg width="80" height="20" viewBox="0 0 80 20" fill="none" aria-hidden="true">
      <path d={d} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Empty states are an instruction, never an apology. */
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="panel px-6 py-10 text-center">
      <p className="display text-lg text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}

/** Says where the numbers came from. Shown wherever seeded data is rendered. */
export function ProvenanceNote({ source, isDemo }: { source: string; isDemo: boolean }) {
  if (!isDemo && source === "postgres") {
    return (
      <div className="flex items-center gap-2 text-xs text-dim">
        <span className="h-1.5 w-1.5 rounded-full bg-positive" />
        Live workspace · Postgres
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs text-dim">
      <span className="h-1.5 w-1.5 rounded-full bg-signal" />
      <span>
        <span className="text-signal">Demo workspace</span> — synthetic organisation
        {source === "memory" ? ", held in memory" : ""}. Not measured telemetry.
      </span>
    </div>
  );
}

export const eur = (n: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

export const num = (n: number) => new Intl.NumberFormat("en-IE").format(n);
