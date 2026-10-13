/**
 * Deterministic communication-draft generation.
 *
 * `generateDraftContent` is a pure template function — no model credentials,
 * no network calls, no randomness — so the same `{ participantName,
 * courseName }` input always produces byte-for-byte the same draft text. It
 * intentionally references only the participant's name and course, never any
 * other sensitive personal context.
 *
 * `getOrCreateDraft` is the fetch-or-create mechanism shared by `GET
 * /api/opportunities/[id]/draft` (`src/app/api/opportunities/[id]/draft/route.ts`)
 * and the opportunity detail page (`src/app/advisor/opportunities/[id]/page.tsx`,
 * via `DraftPanel`) — the same "one domain function, multiple call sites"
 * pattern `listOpportunities` establishes in `src/server/domain/opportunities.ts`.
 * It only reads/writes `store` in place and never touches disk itself; callers
 * persist via `saveStore` (typically inside `withStoreLock`), the same as
 * `evaluateProgramRule` (`src/server/domain/rules.ts`).
 */

import { recordAuditEvent } from "./audit.ts";
import { getCurrentTime } from "./clock.ts";
import type { CommunicationDraft, Id, Opportunity, Store } from "../store/types.ts";

/** The fetch-or-create path acts autonomously, not on behalf of any seeded `Person`. */
const SYSTEM_ACTOR = "system";

export interface GenerateDraftContentParams {
  /** The participant's display name — the only identity context referenced in the draft. */
  participantName: string;
  /** The course name, when the opportunity is linked to one — omitted entirely otherwise. */
  courseName?: string;
}

/**
 * Builds the deterministic outreach draft text for `params`. Pure: given the
 * same `participantName`/`courseName`, it always returns the same string —
 * no model call, no credentials, no clock or random input. References only
 * the participant's name and course, never grades, signals, or any other
 * sensitive context.
 */
export function generateDraftContent({ participantName, courseName }: GenerateDraftContentParams): string {
  const courseClause = courseName ? ` in ${courseName}` : "";

  return [
    `Hi ${participantName},`,
    "",
    `I wanted to check in on how things are going${courseClause}. I noticed a few things that suggest now might be a good time to connect.`,
    "",
    "Could you let me know a time this week that works for a quick chat? I'm happy to work around your schedule.",
    "",
    "Looking forward to hearing from you.",
  ].join("\n");
}

/**
 * Returns the next sequential id for `prefix` (e.g. `"DRAFT-001"`), based on
 * the highest existing numeric suffix among `existingIds` that match
 * `${prefix}-<digits>`. Starts at 1 when no existing id matches. Mirrors the
 * identical helper in `src/server/domain/rules.ts` so draft ids follow the
 * same `PREFIX-NNN` convention as conditions/opportunities.
 */
function nextSequentialId(prefix: string, existingIds: Id[]): Id {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let highest = 0;
  for (const id of existingIds) {
    const match = pattern.exec(id);
    if (match) {
      highest = Math.max(highest, Number(match[1]));
    }
  }
  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
}

export interface GetOrCreateDraftResult {
  draft: CommunicationDraft;
  /** `true` only when this call created the draft; `false` when an existing one was returned untouched. */
  created: boolean;
}

/**
 * Fetches the existing `CommunicationDraft` for `opportunity` if one exists,
 * or creates it (`DRAFT-001` for the first draft) with `reviewConfirmed:
 * false` and `edited: false` otherwise.
 *
 * Idempotent: calling this repeatedly for the same opportunity never creates
 * a duplicate draft — the existing record is returned as-is, byte-for-byte,
 * on every subsequent call. Only mutates `store` (and appends a
 * `communicationDraft.created` audit event) when a new draft is actually
 * created; callers are responsible for persisting the store (e.g.
 * `saveStore`, typically inside `withStoreLock`) when `created` is `true`.
 */
export function getOrCreateDraft(store: Store, opportunity: Opportunity): GetOrCreateDraftResult {
  const existing = store.communicationDrafts.find(
    (draft) => draft.opportunityId === opportunity.id
  );
  if (existing) {
    return { draft: existing, created: false };
  }

  const person = store.people.find((candidate) => candidate.id === opportunity.personId);
  const course = opportunity.courseId
    ? store.courses.find((candidate) => candidate.id === opportunity.courseId)
    : undefined;

  const draft: CommunicationDraft = {
    id: nextSequentialId("DRAFT", store.communicationDrafts.map((candidate) => candidate.id)),
    opportunityId: opportunity.id,
    personId: opportunity.personId,
    content: generateDraftContent({
      participantName: person?.name ?? opportunity.personId,
      courseName: course?.name,
    }),
    edited: false,
    reviewConfirmed: false,
    createdAt: getCurrentTime().toISOString(),
  };

  store.communicationDrafts.push(draft);
  recordAuditEvent(store, {
    actor: SYSTEM_ACTOR,
    entityType: "communicationDraft",
    entityId: draft.id,
    eventType: "communicationDraft.created",
    summary: `Draft ${draft.id} created for opportunity ${opportunity.id}`,
  });

  return { draft, created: true };
}
