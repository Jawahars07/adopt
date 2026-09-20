import type { Metadata } from "next";
import Link from "next/link";
import { Newsreader, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

/**
 * Fonts are self-hosted by next/font at build time rather than pulled from
 * Google. That keeps `font-src 'self'` and `style-src 'self'` intact in the CSP
 * set by proxy.ts — loading them from a CDN would mean widening the policy for
 * the sake of two stylesheets.
 *
 * The pairing is the design thesis: an editorial serif carrying the figures,
 * against an engineering sans and mono carrying the data. An audit report
 * rendered as an instrument.
 */
const display = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-display",
  display: "swap",
});
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

/**
 * Every route renders per-request so the Content-Security-Policy nonce minted in
 * proxy.ts is actually stamped onto Next's scripts. On a prerendered page the
 * header carries a nonce that matches nothing, 'strict-dynamic' then voids the
 * 'self' allowance, and every script on the page is blocked — the app loads as
 * dead HTML with a clean build behind it. Learned the hard way.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Adopt — AI stack control plane",
  description:
    "Route work to the right AI tool across your whole licensed stack, learn from what gets abandoned, and find the seats that are not earning their keep.",
};

const NAV = [
  { href: "/", label: "Route", hint: "Find the right tool for a task" },
  { href: "/ledger", label: "Ledger", hint: "What is working, and what to do about it" },
  { href: "/stack", label: "Stack", hint: "Seats, cost and coverage" },
  { href: "/shadow", label: "Shadow", hint: "Work leaving the licensed stack" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/85 backdrop-blur">
          <div className="mx-auto flex max-w-content items-center gap-6 px-5 py-3">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="display text-lg font-semibold text-ink">Adopt</span>
              <span className="hidden text-[11px] text-dim sm:inline">AI stack control plane</span>
            </Link>

            <nav className="ml-auto flex items-center gap-0.5">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  title={n.hint}
                  className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-content px-5 py-8">{children}</main>

        <footer className="mx-auto max-w-content border-t border-hairline px-5 py-6">
          <p className="text-xs leading-relaxed text-dim">
            Adopt · built by{" "}
            <a
              href="https://github.com/Jawahars07"
              className="text-muted underline-offset-2 hover:text-signal hover:underline"
            >
              Jawahar Naidu
            </a>
            . Capability scores and seat prices in the tool catalog are illustrative figures for
            modelling, not vendor-published pricing.
          </p>
        </footer>
      </body>
    </html>
  );
}
