import { safeEqual } from "./crypto";

/**
 * Gate for the credential and sync endpoints.
 *
 * These routes accept vendor admin secrets and can make authenticated calls
 * into a customer's Microsoft tenant or GitHub organisation. Adopt has no user
 * login yet, so leaving them open would mean anyone who found the URL could
 * write credentials or trigger syncs against someone else's tenant.
 *
 * FAILS CLOSED. With no ADOPT_ADMIN_TOKEN configured the endpoints refuse
 * everything rather than defaulting to open — the opposite choice is how
 * admin surfaces end up exposed on a Friday deploy.
 *
 * This is the minimum, not the destination. Real multi-tenancy needs per-user
 * auth and per-org scoping; a shared token is honest for a single-operator
 * deployment and nothing more.
 */
export type AuthResult = { ok: true } | { ok: false; status: number; error: string };

export function requireAdmin(req: Request): AuthResult {
  const expected = process.env.ADOPT_ADMIN_TOKEN;
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: "Admin endpoints are disabled: ADOPT_ADMIN_TOKEN is not configured.",
    };
  }
  const supplied = req.headers.get("x-adopt-admin") ?? "";
  if (!supplied) return { ok: false, status: 401, error: "Missing admin token." };
  // Constant-time: a plain === leaks the token through response timing.
  if (!safeEqual(supplied, expected)) return { ok: false, status: 401, error: "Invalid admin token." };
  return { ok: true };
}
