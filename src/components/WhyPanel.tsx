/**
 * "Why" panel — gives the Advisor full backward traceability for a single
 * opportunity: opportunity → condition → signals (with provenance +
 * freshness) → playbook version → rule. Rendered by the opportunity detail
 * page (`src/app/advisor/opportunities/[id]/page.tsx`) from the trace
 * resolved by `getOpportunityDetail` (`src/server/domain/opportunities.ts`).
 *
 * Confidence is explained in plain language first (QUAL-001) — the raw
 * number and rationale always follow the interpretation, never precede it.
 * Every expandable section is a native `<details>/<summary>` (QUAL-002) — no
 * custom disclosure widget — so it's keyboard- and screen-reader-operable
 * with zero extra wiring. Sections default open so the full trace is visible
 * without interaction, while still being collapsible.
 *
 * Pure presentational Server Component — no client state, no data fetching.
 */

import type { OpportunityDetail } from "../server/domain/opportunities.ts";

interface WhyPanelProps {
  opportunity: OpportunityDetail;
}

/** Plain-language interpretation of a 0-1 confidence score, shown before the raw number (QUAL-001). */
function describeConfidence(confidence: number): string {
  if (confidence >= 0.9) {
    return "Very high confidence";
  }
  if (confidence >= 0.8) {
    return "High confidence";
  }
  if (confidence >= 0.65) {
    return "Moderate confidence";
  }
  return "Low confidence";
}

/** Human-readable age, e.g. "2 hours ago" / "3 days ago", for a signal's freshness. */
function describeFreshness(freshnessHours: number): string {
  if (freshnessHours < 1) {
    return "just now";
  }
  if (freshnessHours < 24) {
    return `${freshnessHours} hour${freshnessHours === 1 ? "" : "s"} ago`;
  }
  const days = Math.round(freshnessHours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function WhyPanel({ opportunity }: WhyPanelProps) {
  const { condition, playbookVersion } = opportunity;

  return (
    <section aria-labelledby="why-panel-heading">
      <h2 id="why-panel-heading">Why this opportunity?</h2>

      <dl>
        <dt>Participant</dt>
        <dd>{opportunity.participant.name}</dd>
        <dt>Recommended posture</dt>
        <dd>{opportunity.recommendedPosture}</dd>
        <dt>Recommended action</dt>
        <dd>{opportunity.recommendedAction}</dd>
      </dl>

      <details open>
        <summary>Confidence</summary>
        <p>
          <strong>{describeConfidence(opportunity.confidence)}</strong> (
          {Math.round(opportunity.confidence * 100)}%)
        </p>
        <p>{opportunity.rationale}</p>
      </details>

      <details open>
        <summary>Condition {condition.id}</summary>
        <p>
          Created at <time dateTime={condition.createdAt}>{condition.createdAt}</time>
        </p>

        {condition.signals.length === 0 ? (
          <p>No signals are linked to this condition.</p>
        ) : (
          <ul>
            {condition.signals.map((signal) => (
              <li key={signal.id}>
                <strong>{signal.id}</strong> ({signal.type}) — observed{" "}
                <time dateTime={signal.observedAt}>{signal.observedAt}</time> (
                {describeFreshness(signal.freshnessHours)}), source: {signal.provenance.source}
                {signal.provenance.fixtureVersion
                  ? ` (fixture ${signal.provenance.fixtureVersion})`
                  : ""}
              </li>
            ))}
          </ul>
        )}
      </details>

      <details open>
        <summary>Playbook & rule</summary>
        <dl>
          <dt>Playbook</dt>
          <dd>
            {playbookVersion.playbookId} v{playbookVersion.version} ({playbookVersion.status})
          </dd>
          <dt>Rule</dt>
          <dd>
            {playbookVersion.rule.id} (threshold: {playbookVersion.rule.threshold})
          </dd>
        </dl>
      </details>
    </section>
  );
}
