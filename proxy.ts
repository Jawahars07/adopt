import { NextResponse, type NextRequest } from "next/server";

/**
 * Nonce-based Content-Security-Policy (Next 16 `proxy` convention).
 *
 * A CSP with 'unsafe-inline' in script-src is decorative — it permits exactly the
 * injected inline script it is supposed to stop. Next.js needs inline scripts for
 * hydration, so the honest way to get a real policy is a per-request nonce:
 * the proxy mints one, Next stamps it onto its own scripts because it sees the
 * nonce in the CSP header, and 'strict-dynamic' lets those scripts load the rest
 * of the bundle. Anything injected into the DOM by an attacker has no nonce and
 * does not execute.
 *
 * Cost, stated plainly: the proxy makes every matched route dynamic, so static
 * optimisation is given up. For an app this small that is a fair trade for a CSP
 * that actually holds.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    `default-src 'self'`,
    // 'unsafe-eval' is required by the dev-mode React refresh runtime only.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ""}`,
    // Tailwind ships a stylesheet, but Next still injects inline <style> during
    // dev and for critical CSS. style-src is the one place inline stays allowed;
    // a style injection cannot execute code, only restyle.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    // The app talks to its own API routes only. Model calls are server-side, so
    // the browser never needs to reach a provider directly.
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ]
    .filter(Boolean)
    .join("; ")
    .replace(/\s{2,}/g, " ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and the favicon — those need no policy and
    // making them dynamic would cost cache hits for nothing.
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
