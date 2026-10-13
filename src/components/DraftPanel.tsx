/**
 * Draft panel — renders the deterministic communication draft for an
 * opportunity, fetched-or-created via `getOrCreateDraft`
 * (`src/server/lib/communication.ts`), the same domain function backing `GET
 * /api/opportunities/[id]/draft`. Rendered by the opportunity detail page
 * (`src/app/advisor/opportunities/[id]/page.tsx`), alongside `WhyPanel`.
 *
 * Pure presentational Server Component — no client state, no data fetching.
 * Editing, review confirmation, and send are out of scope for this story (see
 * the follow-up human-review story).
 */

import type { CommunicationDraft } from "../server/store/types.ts";

interface DraftPanelProps {
  draft: CommunicationDraft;
}

export default function DraftPanel({ draft }: DraftPanelProps) {
  return (
    <section aria-labelledby="draft-panel-heading">
      <h2 id="draft-panel-heading">Communication draft</h2>

      <dl>
        <dt>Draft</dt>
        <dd>{draft.id}</dd>
        <dt>Review status</dt>
        <dd>
          {draft.reviewConfirmed ? (
            "Reviewed"
          ) : (
            <span role="status">Awaiting review</span>
          )}
        </dd>
      </dl>

      <pre>{draft.content}</pre>
    </section>
  );
}
