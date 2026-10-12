/**
 * `GET /api/clock` / `POST /api/clock` — the documented, scriptable interface
 * onto the synthetic clock in `src/server/lib/clock.ts`. No hidden routes:
 * anything the Verification Toolbar can do, a script can do via these two
 * endpoints.
 */

// The explicit ".js" extension (vs. the bare "next/server") lets this route's
// `__tests__` import it directly under `node --test`, which — unlike Next's
// own bundler — needs a fully-resolvable specifier since the "next" package
// has no "exports" map.
import { NextResponse } from "next/server.js";
import { advanceTo, getCurrentTime } from "../../../server/lib/clock.ts";

export function GET() {
  return NextResponse.json({ current: getCurrentTime().toISOString() });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const instant = (body as { instant?: unknown } | null)?.instant;
  if (typeof instant !== "string") {
    return NextResponse.json(
      { error: '"instant" is required and must be an ISO-8601 string' },
      { status: 400 }
    );
  }

  try {
    await advanceTo(instant);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to advance clock";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ current: getCurrentTime().toISOString() });
}
