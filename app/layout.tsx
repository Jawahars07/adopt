import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

/**
 * Every route renders per-request so the Content-Security-Policy nonce minted in
 * proxy.ts is actually stamped onto Next's scripts. Next only injects the nonce
 * during a dynamic render; on a prerendered page the header carries a nonce that
 * matches nothing, 'strict-dynamic' then voids the 'self' allowance, and every
 * script on the page is blocked — the app loads as dead HTML.
 *
 * The trade is cheap here: these are client components that hydrate and then read
 * their state from localStorage, so a prerender only ever produced an empty shell.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Adopt — GenAI Adoption Companion",
  description:
    "Turn an everyday work task into a qualified GenAI use case, a ready-to-use Copilot prompt, an adoption guide, and tracked feedback.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-black/5 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
            <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-white">A</span>
              Adopt
            </Link>
            <nav className="flex items-center gap-1 text-sm font-medium">
              <Link href="/" className="rounded-lg px-3 py-1.5 hover:bg-black/5">New use case</Link>
              <Link href="/playbook" className="rounded-lg px-3 py-1.5 hover:bg-black/5">Playbook</Link>
              <Link href="/dashboard" className="rounded-lg px-3 py-1.5 hover:bg-black/5">Dashboard</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-5 py-10">{children}</main>
        <footer className="mx-auto max-w-5xl px-5 pb-10 pt-4 text-xs text-black/40">
          Adopt · a GenAI adoption companion · built by{" "}
          <a className="underline hover:text-black/70" href="https://github.com/Jawahars07">
            Jawahar Naidu
          </a>
        </footer>
      </body>
    </html>
  );
}
