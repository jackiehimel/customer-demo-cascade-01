/**
 * `POST /api/drafts/[id]/send` — the simulated "send" action for a
 * communication draft, gated on human review: returns 409 with an explicit
 * error message if `reviewConfirmed` is `false`, leaving the draft entirely
 * unchanged. On success, stamps `sentAt` via `sendDraft`
 * (`src/server/lib/communication.ts`).
 *
 * Pending-outcome creation in the same transaction as the send is out of
 * scope for this story (see this story's technical notes) — a successful
 * send here only stamps `sentAt`; a later story adds the outcome-creation
 * call to this same transaction.
 *
 * Returns 404 when no draft with `id` exists, 409 when review hasn't been
 * confirmed, and 409 again if the draft has already been sent — sending is a
 * one-time, terminal transition.
 */

// The explicit ".js" extension (vs. the bare "next/server") lets this route's
// `__tests__` import it directly under `node --test`, which — unlike Next's
// own bundler — needs a fully-resolvable specifier since the "next" package
// has no "exports" map entry for the bare "next/server" subpath.
import { NextResponse } from "next/server.js";
import { sendDraft } from "../../../../../server/lib/communication.ts";
import { loadStore, saveStore, withStoreLock } from "../../../../../server/store/db.ts";

// The app has no real authenticated-user concept yet (see
// `src/server/lib/session.ts`'s "NOT AN AUTH BOUNDARY" caveat) and only one
// `Person` fixture is seeded, so — matching the publish route's
// `PUBLISHING_ACTOR` — sends are attributed to that single seeded person
// regardless of which demo role is active.
const SENDING_ACTOR = "PERSON-001";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;

  const result = await withStoreLock(() => {
    const store = loadStore();
    const outcome = sendDraft(store, { draftId: id, actor: SENDING_ACTOR });
    if (outcome.status === "sent") {
      saveStore(store);
    }
    return outcome;
  });

  switch (result.status) {
    case "not_found":
      return NextResponse.json({ error: `Draft "${id}" was not found` }, { status: 404 });
    case "review_not_confirmed":
      return NextResponse.json(
        { error: `Draft "${id}" cannot be sent until the advisor confirms review` },
        { status: 409 }
      );
    case "already_sent":
      return NextResponse.json({ error: `Draft "${id}" has already been sent` }, { status: 409 });
    case "sent":
      return NextResponse.json({ draft: result.draft });
  }
}
