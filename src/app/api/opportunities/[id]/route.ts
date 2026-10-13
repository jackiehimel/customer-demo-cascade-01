/**
 * `GET /api/opportunities/[id]` — backs the advisor "Why" view
 * (`src/app/advisor/opportunities/[id]/page.tsx` +
 * `src/components/WhyPanel.tsx`). Resolves the full backward-traceability
 * trail for a single opportunity — opportunity → condition → signals (each
 * with provenance + freshness) → playbook version → rule — via
 * `getOpportunityDetail` (`src/server/domain/opportunities.ts`).
 *
 * Returns 404 when no opportunity with the given id exists.
 */

// The explicit ".js" extension (vs. the bare "next/server") lets this route's
// `__tests__` import it directly under `node --test`, which — unlike Next's
// own bundler — needs a fully-resolvable specifier since the "next" package
// has no "exports" map entry for the bare "next/server" subpath.
import { NextResponse } from "next/server.js";
import { getOpportunityDetail } from "../../../../server/domain/opportunities.ts";
import { loadStore } from "../../../../server/store/db.ts";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;

  const store = loadStore();
  const opportunity = getOpportunityDetail(store, id);

  if (!opportunity) {
    return NextResponse.json({ error: `Opportunity "${id}" was not found` }, { status: 404 });
  }

  return NextResponse.json({ opportunity });
}
