/**
 * `/advisor` — the Advisor's home page, "Command Center". Lists every
 * opportunity (denormalized with participant/program/course context) via
 * `listOpportunities` (`src/server/domain/opportunities.ts`) — the same
 * function backing `GET /api/opportunities` — sorted by priority then
 * recency, with a visible badge on high-priority rows and a keyboard-operable
 * link into each opportunity's "Why" detail page
 * (`/advisor/opportunities/[id]`, rendered via `src/components/WhyPanel.tsx`).
 */

import Link from "next/link";
import { listOpportunities } from "../../server/domain/opportunities.ts";
import { loadStore } from "../../server/store/db.ts";

export default function AdvisorCommandCenterPage() {
  const store = loadStore();
  const opportunities = listOpportunities(store);

  return (
    <main>
      <h1>Command Center</h1>

      {opportunities.length === 0 ? (
        <p>No opportunities to review right now.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Priority</th>
              <th>Participant</th>
              <th>Program</th>
              <th>Course</th>
              <th>Recommended action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {opportunities.map((opportunity) => (
              <tr key={opportunity.id}>
                <td>
                  {opportunity.priority === "high" ? (
                    <span role="status">High priority</span>
                  ) : (
                    opportunity.priority
                  )}
                </td>
                <td>{opportunity.participant.name}</td>
                <td>{opportunity.program?.name ?? "—"}</td>
                <td>{opportunity.course?.name ?? "—"}</td>
                <td>{opportunity.recommendedAction}</td>
                <td>
                  <Link href={`/advisor/opportunities/${opportunity.id}`}>View details</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
