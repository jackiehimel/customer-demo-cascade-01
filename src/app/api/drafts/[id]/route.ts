/**
 * `PATCH /api/drafts/[id]` — edits a communication draft's `content` in place
 * and marks it `edited: true`, via `editDraftContent`
 * (`src/server/lib/communication.ts`). A draft can be edited freely any
 * number of times, with the new content preserved verbatim — but only up
 * until it has been sent (`POST /api/drafts/[id]/send`); edits after that are
 * rejected since `sentAt` is immutable history.
 *
 * Request body: `{ "content": string }`. Returns 422 when `content` is
 * missing or not a string, 404 when no draft with `id` exists, and 409 once
 * the draft has already been sent.
 */

// The explicit ".js" extension (vs. the bare "next/server") lets this route's
// `__tests__` import it directly under `node --test`, which — unlike Next's
// own bundler — needs a fully-resolvable specifier since the "next" package
// has no "exports" map entry for the bare "next/server" subpath.
import { NextResponse } from "next/server.js";
import { editDraftContent } from "../../../../server/lib/communication.ts";
import { loadStore, saveStore, withStoreLock } from "../../../../server/store/db.ts";

// The app has no real authenticated-user concept yet (see
// `src/server/lib/session.ts`'s "NOT AN AUTH BOUNDARY" caveat) and only one
// `Person` fixture is seeded, so — matching the publish route's
// `PUBLISHING_ACTOR` — draft edits are attributed to that single seeded
// person regardless of which demo role is active.
const EDITING_ACTOR = "PERSON-001";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;

  const body = (await request.json().catch(() => null)) as { content?: unknown } | null;
  const content = body?.content;
  if (typeof content !== "string") {
    return NextResponse.json({ error: "content must be a string" }, { status: 422 });
  }

  const result = await withStoreLock(() => {
    const store = loadStore();
    const outcome = editDraftContent(store, { draftId: id, content, actor: EDITING_ACTOR });
    if (outcome.status === "ok") {
      saveStore(store);
    }
    return outcome;
  });

  switch (result.status) {
    case "not_found":
      return NextResponse.json({ error: `Draft "${id}" was not found` }, { status: 404 });
    case "already_sent":
      return NextResponse.json(
        { error: `Draft "${id}" has already been sent and can no longer be edited` },
        { status: 409 }
      );
    case "ok":
      return NextResponse.json({ draft: result.draft });
  }
}
