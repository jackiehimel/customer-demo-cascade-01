/**
 * `POST /api/drafts/[id]/confirm-review` — the sole mechanism that sets a
 * communication draft's `reviewConfirmed: true`, via `confirmDraftReview`
 * (`src/server/lib/communication.ts`). This flag is never set by merely
 * fetching the draft (`GET /api/opportunities/[id]/draft`) — only this
 * explicit, advisor-initiated action satisfies the human-review gate `POST
 * /api/drafts/[id]/send` enforces.
 *
 * Idempotent: confirming an already-confirmed draft is a no-op success.
 * Returns 404 when no draft with `id` exists, and 409 once the draft has
 * already been sent (review confirmation on sent history is meaningless).
 */

// The explicit ".js" extension (vs. the bare "next/server") lets this route's
// `__tests__` import it directly under `node --test`, which — unlike Next's
// own bundler — needs a fully-resolvable specifier since the "next" package
// has no "exports" map entry for the bare "next/server" subpath.
import { NextResponse } from "next/server.js";
import { confirmDraftReview } from "../../../../../server/lib/communication.ts";
import { loadStore, saveStore, withStoreLock } from "../../../../../server/store/db.ts";

// The app has no real authenticated-user concept yet (see
// `src/server/lib/session.ts`'s "NOT AN AUTH BOUNDARY" caveat) and only one
// `Person` fixture is seeded, so — matching the publish route's
// `PUBLISHING_ACTOR` — review confirmations are attributed to that single
// seeded person regardless of which demo role is active.
const REVIEWING_ACTOR = "PERSON-001";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;

  const result = await withStoreLock(() => {
    const store = loadStore();
    const outcome = confirmDraftReview(store, { draftId: id, actor: REVIEWING_ACTOR });
    if (outcome.status === "ok" && !outcome.alreadyConfirmed) {
      saveStore(store);
    }
    return outcome;
  });

  switch (result.status) {
    case "not_found":
      return NextResponse.json({ error: `Draft "${id}" was not found` }, { status: 404 });
    case "already_sent":
      return NextResponse.json(
        { error: `Draft "${id}" has already been sent; review confirmation no longer applies` },
        { status: 409 }
      );
    case "ok":
      return NextResponse.json({ draft: result.draft });
  }
}
