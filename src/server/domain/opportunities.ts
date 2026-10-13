/**
 * Opportunity listing + detail domain logic — the denormalization behind the
 * Advisor Command Center (`src/app/advisor/page.tsx`), its backing route
 * (`src/app/api/opportunities/route.ts`), and the "Why" view
 * (`src/app/advisor/opportunities/[id]/page.tsx` + `GET
 * /api/opportunities/[id]`).
 *
 * `listOpportunities` joins `Opportunity` → `Person`/`Program`/`Course` from
 * the store into a single flat, UI-ready shape and sorts it by priority (high
 * first) then recency (newest first). Both the route and the page call this
 * one function so the two call sites can never drift — in particular, a
 * later story's resurfacing behavior only needs to change what's *in*
 * `store.opportunities`, never this shape or its sort order.
 *
 * `getOpportunityDetail` resolves the full backward-traceability trail for a
 * single opportunity — opportunity → condition → signals (with provenance +
 * freshness) → playbook version → rule — reusing the same participant/
 * program/course denormalization as `listOpportunities` rather than
 * duplicating it.
 *
 * Pure: only reads `store`, never mutates it or touches disk.
 */

import type {
  Id,
  IsoDateTime,
  Opportunity,
  OpportunityPriority,
  OpportunityStatus,
  PlaybookRule,
  PlaybookVersionStatus,
  SignalProvenance,
  SignalType,
  Store,
} from "../store/types.ts";

export interface OpportunityParticipant {
  id: Id;
  name: string;
  email?: string;
}

export interface OpportunityProgram {
  id: Id;
  name: string;
}

export interface OpportunityCourse {
  id: Id;
  code: string;
  name: string;
}

/** The denormalized, UI-ready shape of a single opportunity list row. */
export interface OpportunityListItem {
  id: Id;
  status: OpportunityStatus;
  priority: OpportunityPriority;
  recommendedAction: string;
  createdAt: IsoDateTime;
  participant: OpportunityParticipant;
  program?: OpportunityProgram;
  course?: OpportunityCourse;
}

/** Highest priority sorts first; unrecognized priorities sort last (defensive, should never happen). */
const PRIORITY_RANK: Record<OpportunityPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function priorityRank(priority: OpportunityPriority): number {
  return PRIORITY_RANK[priority] ?? Number.MAX_SAFE_INTEGER;
}

interface OpportunityContext {
  participant: OpportunityParticipant;
  program?: OpportunityProgram;
  course?: OpportunityCourse;
}

/** Resolves an opportunity's participant/program/course context, falling back gracefully when a reference is missing. */
function resolveContext(opportunity: Opportunity, store: Store): OpportunityContext {
  const person = store.people.find((candidate) => candidate.id === opportunity.personId);
  const program = person
    ? store.programs.find((candidate) => candidate.id === person.programId)
    : undefined;
  const course = opportunity.courseId
    ? store.courses.find((candidate) => candidate.id === opportunity.courseId)
    : undefined;

  return {
    participant: person
      ? { id: person.id, name: person.name, email: person.email }
      : { id: opportunity.personId, name: opportunity.personId },
    program: program ? { id: program.id, name: program.name } : undefined,
    course: course ? { id: course.id, code: course.code, name: course.name } : undefined,
  };
}

function toListItem(opportunity: Opportunity, store: Store): OpportunityListItem {
  const { participant, program, course } = resolveContext(opportunity, store);

  return {
    id: opportunity.id,
    status: opportunity.status,
    priority: opportunity.priority,
    recommendedAction: opportunity.recommendedAction,
    createdAt: opportunity.createdAt,
    participant,
    program,
    course,
  };
}

/**
 * Returns every opportunity in `store`, denormalized with participant,
 * program, and course context, sorted by priority (high → medium → low)
 * then recency (`createdAt` descending) within each priority tier.
 *
 * Intentionally includes every `OpportunityStatus` (not just `"open"`) so a
 * later story's resurfacing behavior can rely on this same function without
 * route or shape changes — it only needs to change what's in
 * `store.opportunities`.
 */
export function listOpportunities(store: Store): OpportunityListItem[] {
  return [...store.opportunities]
    .sort((a, b) => {
      const rankDiff = priorityRank(a.priority) - priorityRank(b.priority);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
    .map((opportunity) => toListItem(opportunity, store));
}

/** A single signal in the "Why" view's trace, with its freshness relative to the store's synthetic clock. */
export interface OpportunitySignalDetail {
  id: Id;
  type: SignalType;
  value?: unknown;
  observedAt: IsoDateTime;
  provenance: SignalProvenance;
  /** Hours between `observedAt` and the store's current synthetic time — how stale this signal is. */
  freshnessHours: number;
}

/** The condition node in the "Why" view's trace, with every contributing signal resolved. */
export interface OpportunityConditionDetail {
  id: Id;
  createdAt: IsoDateTime;
  signals: OpportunitySignalDetail[];
}

/** The playbook-version node in the "Why" view's trace, including the rule that governed it. */
export interface OpportunityPlaybookVersionDetail {
  id: Id;
  playbookId: Id;
  version: number;
  status: PlaybookVersionStatus;
  rule: PlaybookRule;
}

/** Full backward-traceability payload for a single opportunity: opportunity -> condition -> signals -> playbook version -> rule. */
export interface OpportunityDetail {
  id: Id;
  status: OpportunityStatus;
  priority: OpportunityPriority;
  recommendedAction: string;
  createdAt: IsoDateTime;
  participant: OpportunityParticipant;
  program?: OpportunityProgram;
  course?: OpportunityCourse;
  condition: OpportunityConditionDetail;
  playbookVersion: OpportunityPlaybookVersionDetail;
  confidence: number;
  rationale: string;
  recommendedPosture: string;
}

/**
 * Resolves the full backward-traceability trail for a single opportunity —
 * opportunity → condition → signals (each with provenance + freshness) →
 * playbook version → rule — powering the advisor "Why" view
 * (`GET /api/opportunities/[id]` and `src/components/WhyPanel.tsx`).
 *
 * Returns `undefined` when no opportunity with `id` exists. Throws if an
 * opportunity references a condition or playbook version that is missing
 * from the store — that would mean the store itself is corrupt, which should
 * never happen via normal app flows (the rule engine always creates these
 * records together).
 */
export function getOpportunityDetail(store: Store, id: Id): OpportunityDetail | undefined {
  const opportunity = store.opportunities.find((candidate) => candidate.id === id);
  if (!opportunity) {
    return undefined;
  }

  const { participant, program, course } = resolveContext(opportunity, store);

  const condition = store.conditions.find((candidate) => candidate.id === opportunity.conditionId);
  if (!condition) {
    throw new Error(
      `Opportunity ${opportunity.id} references missing condition ${opportunity.conditionId}`
    );
  }

  const playbookVersion = store.playbookVersions.find(
    (candidate) => candidate.id === condition.playbookVersionId
  );
  if (!playbookVersion) {
    throw new Error(
      `Condition ${condition.id} references missing playbook version ${condition.playbookVersionId}`
    );
  }

  const now = new Date(store.clock.current).getTime();
  const signals: OpportunitySignalDetail[] = condition.signalIds
    .map((signalId) => store.signals.find((candidate) => candidate.id === signalId))
    .filter((signal): signal is NonNullable<typeof signal> => Boolean(signal))
    .map((signal) => ({
      id: signal.id,
      type: signal.type,
      value: signal.value,
      observedAt: signal.observedAt,
      provenance: signal.provenance,
      freshnessHours: Math.round((now - new Date(signal.observedAt).getTime()) / (1000 * 60 * 60)),
    }));

  return {
    id: opportunity.id,
    status: opportunity.status,
    priority: opportunity.priority,
    recommendedAction: opportunity.recommendedAction,
    createdAt: opportunity.createdAt,
    participant,
    program,
    course,
    condition: {
      id: condition.id,
      createdAt: condition.createdAt,
      signals,
    },
    playbookVersion: {
      id: playbookVersion.id,
      playbookId: playbookVersion.playbookId,
      version: playbookVersion.version,
      status: playbookVersion.status,
      rule: playbookVersion.rule,
    },
    confidence: opportunity.explanation.confidence,
    rationale: opportunity.explanation.rationale,
    recommendedPosture: opportunity.explanation.recommendedPosture,
  };
}
