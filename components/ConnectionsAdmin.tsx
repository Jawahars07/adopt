"use client";

import { useEffect, useState } from "react";
import { Chip, Eyebrow, type Tone } from "./ui";

/**
 * The interactive half of the Connections page.
 *
 * Connector objects hold a `fetch` function and cannot cross the server/client
 * boundary, so the page maps them to this plain shape first.
 *
 * The admin token is held in sessionStorage rather than localStorage: it dies
 * with the tab. A shared token is a blunt instrument, and the shorter its
 * lifetime the better until real per-user auth exists.
 */

export type ConnectorView = {
  slug: string;
  name: string;
  vendor: string;
  docs: string;
  requiredScopes: string[];
  fields: { key: string; label: string; secret: boolean; help: string }[];
  verifiedAgainstLiveTenant: boolean;
  status: string;
  lastError: string | null;
  lastSyncedAt: string | null;
  configuredKeys: string[];
};

const STATUS_TONE: Record<string, Tone> = {
  ready: "positive", error: "negative", disabled: "neutral", unconfigured: "neutral",
};

const TOKEN_KEY = "adopt.adminToken";

type SyncResult = {
  toolSlug: string;
  status: string;
  rowsWritten: number;
  sourceEndpoint: string | null;
  caveat: string | null;
  error: string | null;
};

export function ConnectionsAdmin({ connectors }: { connectors: ConnectorView[] }) {
  const [token, setToken] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ slug: string; text: string; ok: boolean } | null>(null);
  const [results, setResults] = useState<SyncResult[]>([]);

  useEffect(() => {
    try {
      setToken(sessionStorage.getItem(TOKEN_KEY) ?? "");
    } catch {
      /* private browsing — the field just starts empty */
    }
  }, []);

  function rememberToken(v: string) {
    setToken(v);
    try {
      sessionStorage.setItem(TOKEN_KEY, v);
    } catch {
      /* not fatal; the token still works for this render */
    }
  }

  function setField(slug: string, key: string, v: string) {
    setValues((prev) => ({ ...prev, [slug]: { ...(prev[slug] ?? {}), [key]: v } }));
  }

  async function save(slug: string) {
    setBusy(slug);
    setMessage(null);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-adopt-admin": token },
        body: JSON.stringify({ toolSlug: slug, fields: values[slug] ?? {} }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save.");
      // Clear secret inputs from memory once stored. They are write-only by
      // design and there is no reason to keep them in React state.
      setValues((prev) => ({ ...prev, [slug]: {} }));
      setMessage({ slug, ok: true, text: `Saved ${data.storedSecretKeys.length} secret and ${data.storedConfigKeys.length} config field(s).` });
    } catch (err) {
      setMessage({ slug, ok: false, text: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setBusy(null);
    }
  }

  async function sync(slug?: string) {
    setBusy(slug ?? "all");
    setMessage(null);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-adopt-admin": token },
        body: JSON.stringify(slug ? { toolSlug: slug } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed.");
      setResults(data.results ?? []);
    } catch (err) {
      setMessage({ slug: slug ?? "all", ok: false, text: err instanceof Error ? err.message : "Sync failed." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <Eyebrow>Admin token</Eyebrow>
        <p className="mt-1.5 text-xs leading-relaxed text-dim">
          Required to store credentials or run a sync. Set as <code className="font-mono">ADOPT_ADMIN_TOKEN</code>{" "}
          in the environment. Held for this browser tab only, never written to disk.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="password"
            value={token}
            onChange={(e) => rememberToken(e.target.value)}
            placeholder="Paste the admin token"
            className="field max-w-md"
            autoComplete="off"
          />
          <button onClick={() => sync()} disabled={!token || busy !== null} className="btn btn-signal">
            {busy === "all" ? "Syncing..." : "Sync all"}
          </button>
        </div>
      </section>

      {results.length > 0 ? (
        <section className="panel p-5">
          <Eyebrow>Sync result</Eyebrow>
          <div className="mt-3 space-y-2">
            {results.map((r) => (
              <div key={r.toolSlug} className="panel-inset p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={r.status === "ok" ? "positive" : r.status === "failed" ? "negative" : "caution"}>
                    {r.status}
                  </Chip>
                  <span className="text-sm text-ink">{r.toolSlug}</span>
                  <span className="num ml-auto text-xs text-dim">{r.rowsWritten} rows</span>
                </div>
                {r.sourceEndpoint ? <code className="mt-1.5 block font-mono text-[11px] text-dim">{r.sourceEndpoint}</code> : null}
                {r.caveat ? <p className="mt-1.5 text-xs text-caution">{r.caveat}</p> : null}
                {r.error ? <p className="mt-1.5 text-xs text-negative">{r.error}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {connectors.map((c) => (
        <article key={c.slug} className="panel p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-ink">{c.name}</span>
            <span className="text-xs text-dim">{c.vendor}</span>
            <span className="ml-auto flex items-center gap-2">
              {!c.verifiedAgainstLiveTenant ? <Chip tone="caution">Unproven against a live tenant</Chip> : null}
              <Chip tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status}</Chip>
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {c.requiredScopes.map((s) => (
              <code key={s} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">{s}</code>
            ))}
            <a href={c.docs} className="text-xs text-signal underline-offset-2 hover:underline">Vendor docs</a>
            <button
              onClick={() => setOpen(open === c.slug ? null : c.slug)}
              className="btn ml-auto text-xs"
            >
              {open === c.slug ? "Close" : c.status === "unconfigured" ? "Connect" : "Edit"}
            </button>
            {c.status !== "unconfigured" ? (
              <button onClick={() => sync(c.slug)} disabled={!token || busy !== null} className="btn text-xs">
                {busy === c.slug ? "Syncing..." : "Sync now"}
              </button>
            ) : null}
          </div>

          {open === c.slug ? (
            <div className="mt-4 space-y-3 border-t border-hairline pt-4">
              {c.fields.map((f) => (
                <div key={f.key}>
                  <label className="eyebrow" htmlFor={`${c.slug}-${f.key}`}>
                    {f.label}
                    {f.secret ? <span className="ml-1.5 normal-case tracking-normal text-signal">encrypted at rest</span> : null}
                    {c.configuredKeys.includes(f.key) ? (
                      <span className="ml-1.5 normal-case tracking-normal text-positive">already stored</span>
                    ) : null}
                  </label>
                  <input
                    id={`${c.slug}-${f.key}`}
                    type={f.secret ? "password" : "text"}
                    value={values[c.slug]?.[f.key] ?? ""}
                    onChange={(e) => setField(c.slug, f.key, e.target.value)}
                    placeholder={f.secret && c.configuredKeys.length ? "Leave blank to keep the stored value" : ""}
                    className="field mt-1.5"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="mt-1 text-xs text-dim">{f.help}</p>
                </div>
              ))}
              <button onClick={() => save(c.slug)} disabled={!token || busy !== null} className="btn btn-signal text-xs">
                {busy === c.slug ? "Saving..." : "Save credentials"}
              </button>
            </div>
          ) : null}

          {message?.slug === c.slug ? (
            <p className={`mt-3 text-xs ${message.ok ? "text-positive" : "text-negative"}`}>{message.text}</p>
          ) : null}
          {c.lastError ? <p className="mt-3 border-l-2 border-negative pl-3 text-xs text-negative">{c.lastError}</p> : null}
          {c.lastSyncedAt ? <p className="mt-2 text-xs text-dim">Last synced {new Date(c.lastSyncedAt).toUTCString()}</p> : null}
        </article>
      ))}
    </div>
  );
}
