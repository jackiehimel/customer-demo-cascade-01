/**
 * `GET /api/opportunities` — backs the Advisor Command Center
 * (`src/app/advisor/page.tsx`). Returns every opportunity denormalized with
 * participant/program/course context, sorted by priority then recency, via
 * `listOpportunities` (`src/server/domain/opportunities.ts`).
 *
 * Deliberately has no filters or pagination yet — a later story's
 * resurfacing behavior only needs to change which opportunities exist in the
 * store, not this route's shape.
 */

// The explicit ".js" extension (vs. the bare "next/server") lets this route's
// `__tests__` import it directly under `node --test`, which — unlike Next's
// own bundler — needs a fully-resolvable specifier since the "next" package
// has no "exports" map entry for the bare "next/server" subpath.
import { NextResponse } from "next/server.js";
import { listOpportunities } from "../../../server/domain/opportunities.ts";
import { loadStore } from "../../../server/store/db.ts";

export function GET() {
  const store = loadStore();
  const opportunities = listOpportunities(store);
  return NextResponse.json({ opportunities });
}
