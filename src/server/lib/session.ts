/**
 * Demo role session helper.
 *
 * ⚠️ NOT AN AUTH BOUNDARY. This module only remembers which persona
 * (administrator/advisor) the current browser picked on the role-selection
 * screen, via a plain, unsigned cookie, purely so the UI can show the right
 * navigation and screens for that persona. It performs no verification of
 * identity and grants no access — any code that needs real authentication or
 * authorization belongs in a separate, properly-scoped story and must not be
 * bolted onto this helper.
 *
 * Deliberately framework-agnostic (works against the raw Fetch API `Request`
 * object) so it can be exercised with `node --test` the same way the clock
 * and reset routes are, without needing a live Next.js request context.
 */

import type { RoleKey } from "../store/types";

/** Re-exported for call sites that only need the role vocabulary, not the store. */
export type DemoRole = RoleKey;

export const DEMO_ROLE_COOKIE = "demo-role";

const DEMO_ROLES: readonly DemoRole[] = ["administrator", "advisor"];

/** Narrows an arbitrary value (query param, cookie value, JSON body field) to a `DemoRole`. */
export function isDemoRole(value: unknown): value is DemoRole {
  return typeof value === "string" && (DEMO_ROLES as readonly string[]).includes(value);
}

/**
 * Parses the `demo-role` cookie out of an incoming request's `Cookie`
 * header. Returns `null` when no role has been selected yet, or when the
 * stored value is no longer a recognized role (e.g. the cookie vocabulary
 * changed).
 */
export function parseDemoRoleFromRequest(request: Request): DemoRole | null {
  const header = request.headers.get("cookie");
  if (!header) {
    return null;
  }

  for (const part of header.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const name = part.slice(0, separatorIndex).trim();
    if (name !== DEMO_ROLE_COOKIE) {
      continue;
    }
    const rawValue = part.slice(separatorIndex + 1).trim();
    const value = decodeURIComponent(rawValue);
    return isDemoRole(value) ? value : null;
  }

  return null;
}

/**
 * Builds the `Set-Cookie` header value that persists `role` as the current
 * demo role. `Path=/` so every route (including `/api/*`) sees it;
 * `SameSite=Lax` because it's a same-site demo convenience, not a credential.
 */
export function buildDemoRoleSetCookie(role: DemoRole): string {
  return `${DEMO_ROLE_COOKIE}=${encodeURIComponent(role)}; Path=/; SameSite=Lax`;
}

/**
 * Narrows a raw cookie value (e.g. from `next/headers`'s `cookies()`, used
 * by Server Components like the root layout) to a `DemoRole`, or `null` when
 * absent/invalid.
 */
export function extractDemoRole(cookieValue: string | undefined): DemoRole | null {
  return isDemoRole(cookieValue) ? cookieValue : null;
}
