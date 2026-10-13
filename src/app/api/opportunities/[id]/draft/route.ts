/**
 * `GET /api/opportunities/[id]/draft` — fetches the existing communication
 * draft for the opportunity whose `id` is the dynamic route segment, or
 * creates it (`DRAFT-001`) with `reviewConfirmed: false` otherwise. Delegates
 * the fetch-or-create semantics to `getOrCreateDraft`
 * (`src/server/lib/communication.ts`), the same domain function the
 * opportunity detail page uses to back `DraftPanel`
 * (`src/components/DraftPanel.tsx`).
 *
 * Idempotent: calling this repeatedly for the same opportunity always returns
 * the same draft, never a duplicate. Returns 404 when no opportunity with the
 * given id exists.
 */

// The explicit ".js" extension (vs. the bare "next/server") lets this route's
// `__tests__` import it directly under `node --test`, which — unlike Next's
// own bundler — needs a fully-resolvable specifier since the "next" package
// has no "exports" map entry for the bare "next/server" subpath.
import { NextResponse } from "next/server.js";
import { getOrCreateDraft } from "../../../../../server/lib/communication.ts";
import { loadStore, saveStore, withStoreLock } from "../../../../../server/store/db.ts";
import type { CommunicationDraft } from "../../../../../server/store/types.ts";

type DraftRouteResult =
  | { status: "not_found" }
  | { status: "ok"; draft: CommunicationDraft };

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;

  const result = await withStoreLock((): DraftRouteResult => {
    const store = loadStore();
    const opportunity = store.opportunities.find((candidate) => candidate.id === id);
    if (!opportunity) {
      return { status: "not_found" };
    }

    const { draft, created } = getOrCreateDraft(store, opportunity);
    if (created) {
      saveStore(store);
    }

    return { status: "ok", draft };
  });

  if (result.status === "not_found") {
    return NextResponse.json({ error: `Opportunity "${id}" was not found` }, { status: 404 });
  }

  return NextResponse.json({ draft: result.draft });
}
