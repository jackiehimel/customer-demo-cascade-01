/**
 * Opportunity listing domain logic — the denormalization behind the Advisor
 * Command Center (`src/app/advisor/page.tsx`) and its backing route
 * (`src/app/api/opportunities/route.ts`).
 *
 * `listOpportunities` joins `Opportunity` → `Person`/`Program`/`Course` from
 * the store into a single flat, UI-ready shape and sorts it by priority (high
 * first) then recency (newest first). Both the route and the page call this
 * one function so the two call sites can never drift — in particular, a
 * later story's resurfacing behavior only needs to change what's *in*
 * `store.opportunities`, never this shape or its sort order.
 *
 * Pure: only reads `store`, never mutates it or touches disk.
 */

import type {
  Id,
  IsoDateTime,
  Opportunity,
  OpportunityPriority,
  OpportunityStatus,
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

function toListItem(opportunity: Opportunity, store: Store): OpportunityListItem {
  const person = store.people.find((candidate) => candidate.id === opportunity.personId);
  const program = person
    ? store.programs.find((candidate) => candidate.id === person.programId)
    : undefined;
  const course = opportunity.courseId
    ? store.courses.find((candidate) => candidate.id === opportunity.courseId)
    : undefined;

  return {
    id: opportunity.id,
    status: opportunity.status,
    priority: opportunity.priority,
    recommendedAction: opportunity.recommendedAction,
    createdAt: opportunity.createdAt,
    participant: person
      ? { id: person.id, name: person.name, email: person.email }
      : { id: opportunity.personId, name: opportunity.personId },
    program: program ? { id: program.id, name: program.name } : undefined,
    course: course ? { id: course.id, code: course.code, name: course.name } : undefined,
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
