/**
 * `POST /api/playbooks/[id]/publish` — publishes the playbook version whose
 * `id` is the dynamic route segment (e.g. "PLAYBOOK-001-V2"). Delegates all
 * validation and mutation to `publishPlaybookVersion`
 * (`src/server/domain/playbooks.ts`); this route is only responsible for
 * wiring that domain call, the rule-engine evaluation
 * (`src/server/domain/rules.ts`), and the `playbook.published` audit event
 * into a single `withStoreLock` transaction, then mapping the result onto
 * the right HTTP status.
 */

// The explicit ".js" extension (vs. the bare "next/server") lets this route's
// `__tests__` import it directly under `node --test`, which — unlike Next's
// own bundler — needs a fully-resolvable specifier since the "next" package
// has no "exports" map entry for the bare "next/server" subpath.
import { NextResponse } from "next/server.js";
import {
  publishPlaybookVersion,
  type PublishPlaybookVersionResult,
} from "../../../../../server/domain/playbooks.ts";
import { evaluateProgramRule } from "../../../../../server/domain/rules.ts";
import { recordAuditEvent } from "../../../../../server/lib/audit.ts";
import { loadStore, saveStore, withStoreLock } from "../../../../../server/store/db.ts";

// The app has no real authenticated-user concept yet (see
// `src/server/lib/session.ts`'s "NOT AN AUTH BOUNDARY" caveat) and only one
// `Person` fixture is seeded, so — matching the seed data's own
// `publishedAt`/`publishedBy` on PLAYBOOK-001-V1 — publishes are attributed
// to that single seeded person regardless of which demo role is active.
const PUBLISHING_ACTOR = "PERSON-001";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;

  const result = await withStoreLock((): PublishPlaybookVersionResult => {
    const store = loadStore();
    const outcome = publishPlaybookVersion(store, { versionId: id, publishedBy: PUBLISHING_ACTOR });

    // Only touch the store (rule-engine trigger, audit event, persistence)
    // when this call actually changed something — re-publishing an
    // already-published version must stay a true no-op.
    if (outcome.status === "published" && !outcome.alreadyPublished) {
      evaluateProgramRule(store, outcome.version);
      recordAuditEvent(store, {
        actor: PUBLISHING_ACTOR,
        entityType: "playbookVersion",
        entityId: outcome.version.id,
        eventType: "playbook.published",
        summary: `Published playbook version ${outcome.version.version} of ${outcome.version.playbookId}`,
      });
      saveStore(store);
    }

    return outcome;
  });

  switch (result.status) {
    case "not_found":
      return NextResponse.json({ error: `Playbook version "${id}" was not found` }, { status: 404 });
    case "invalid":
      return NextResponse.json({ errors: result.errors }, { status: 422 });
    case "published":
      return NextResponse.json({ version: result.version }, { status: 200 });
  }
}
