/**
 * `/advisor/opportunities/[id]` — the advisor "Why" view, linked from the
 * Command Center (`src/app/advisor/page.tsx`). Resolves the full backward
 * trace for the opportunity via `getOpportunityDetail`
 * (`src/server/domain/opportunities.ts`) and renders it through `WhyPanel`
 * (`src/components/WhyPanel.tsx`), then fetches-or-creates the opportunity's
 * communication draft via `getOrCreateDraft`
 * (`src/server/lib/communication.ts`) — the same domain function backing `GET
 * /api/opportunities/[id]/draft` — and renders it through `DraftPanel`
 * (`src/components/DraftPanel.tsx`).
 *
 * Renders Next's standard not-found UI when the id doesn't resolve to an
 * opportunity (e.g. a stale link or a typo'd id).
 */

import { notFound } from "next/navigation";
import DraftPanel from "../../../../components/DraftPanel.tsx";
import WhyPanel from "../../../../components/WhyPanel.tsx";
import { getOpportunityDetail } from "../../../../server/domain/opportunities.ts";
import { getOrCreateDraft } from "../../../../server/lib/communication.ts";
import { loadStore, saveStore, withStoreLock } from "../../../../server/store/db.ts";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const result = await withStoreLock(() => {
    const store = loadStore();
    const rawOpportunity = store.opportunities.find((candidate) => candidate.id === id);
    if (!rawOpportunity) {
      return { opportunity: undefined, draft: undefined };
    }

    const opportunity = getOpportunityDetail(store, id);
    const draftResult = getOrCreateDraft(store, rawOpportunity);
    if (draftResult.created) {
      saveStore(store);
    }

    return { opportunity, draft: draftResult.draft };
  });

  if (!result.opportunity || !result.draft) {
    notFound();
  }

  const { opportunity, draft } = result;

  return (
    <main>
      <h1>Opportunity {opportunity.id}</h1>
      <WhyPanel opportunity={opportunity} />
      <DraftPanel draft={draft} />
    </main>
  );
}
