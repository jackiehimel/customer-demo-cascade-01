/**
 * `/advisor/opportunities/[id]` — the advisor "Why" view, linked from the
 * Command Center (`src/app/advisor/page.tsx`). Resolves the full backward
 * trace for the opportunity via `getOpportunityDetail`
 * (`src/server/domain/opportunities.ts`) and renders it through
 * `WhyPanel` (`src/components/WhyPanel.tsx`).
 *
 * Renders Next's standard not-found UI when the id doesn't resolve to an
 * opportunity (e.g. a stale link or a typo'd id).
 */

import { notFound } from "next/navigation";
import WhyPanel from "../../../../components/WhyPanel.tsx";
import { getOpportunityDetail } from "../../../../server/domain/opportunities.ts";
import { loadStore } from "../../../../server/store/db.ts";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const store = loadStore();
  const opportunity = getOpportunityDetail(store, id);

  if (!opportunity) {
    notFound();
  }

  return (
    <main>
      <h1>Opportunity {opportunity.id}</h1>
      <WhyPanel opportunity={opportunity} />
    </main>
  );
}
