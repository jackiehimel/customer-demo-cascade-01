/**
 * `GET /api/session/role` / `POST /api/session/role` — reads and sets the
 * demo-role cookie documented in `src/server/lib/session.ts`.
 *
 * ⚠️ NOT AN AUTH BOUNDARY — see that file's header comment for the full
 * caveat. This route never checks credentials; it just stores which demo
 * persona the browser picked.
 */

// The explicit ".js" extension (vs. the bare "next/server") lets this route's
// `__tests__` import it directly under `node --test`, which — unlike Next's
// own bundler — needs a fully-resolvable specifier since the "next" package
// has no "exports" map.
import { NextResponse } from "next/server.js";
import {
  buildDemoRoleSetCookie,
  isDemoRole,
  parseDemoRoleFromRequest,
} from "../../../../server/lib/session.ts";

export function GET(request: Request) {
  return NextResponse.json({ role: parseDemoRoleFromRequest(request) });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const role = (body as { role?: unknown } | null)?.role;
  if (!isDemoRole(role)) {
    return NextResponse.json(
      { error: '"role" is required and must be "administrator" or "advisor"' },
      { status: 400 }
    );
  }

  const response = NextResponse.json({ role });
  response.headers.append("Set-Cookie", buildDemoRoleSetCookie(role));
  return response;
}
