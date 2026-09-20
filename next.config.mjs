/** @type {import('next').NextConfig} */

/**
 * Transport and browser-behaviour headers.
 *
 * The Content-Security-Policy is deliberately NOT here — it carries a per-request
 * nonce, so it is set in middleware.ts. Everything below is request-independent
 * and belongs at the config layer.
 */
const securityHeaders = [
  // Force HTTPS for two years, including subdomains. Vercel terminates TLS, but
  // this stops a downgrade on the first hop after the initial visit.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Belt and braces with the CSP frame-ancestors directive, for older browsers.
  { key: "X-Frame-Options", value: "DENY" },
  // Stop the browser second-guessing declared content types.
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app needs none of these. Denying them shrinks what a compromised script
  // could reach for.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig = {
  reactStrictMode: true,
  // Do not advertise the framework version to scanners.
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // API responses are per-user and must never be cached by a shared proxy.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
