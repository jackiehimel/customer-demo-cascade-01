/**
 * Deterministic communication-draft generation plus the human-review-gated
 * state machine every draft moves through: generated → (optionally) edited →
 * review confirmed → sent.
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
 *
 * `editDraftContent`, `confirmDraftReview`, and `sendDraft` back the three
 * distinct state-transition endpoints under `src/app/api/drafts/[id]/`
 * (`route.ts`'s `PATCH`, `confirm-review/route.ts`, and `send/route.ts`
 * respectively) — one domain function per endpoint, matching the card's
 * explicit route list rather than overloading a single mutation. Once a draft
 * is sent (`sentAt` set) it is immutable: edits and review confirmation are
 * both rejected, and sending again is a no-op rejection rather than a
 * duplicate transition.
 *
 * Every function here only reads/writes `store` in place and never touches
 * disk itself; callers persist via `saveStore` (typically inside
 * `withStoreLock`), the same as `evaluateProgramRule`
 * (`src/server/domain/rules.ts`).
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

export interface EditDraftContentParams {
  draftId: Id;
  content: string;
  /** The advisor performing the edit, stamped onto the resulting audit event. */
  actor: Id;
}

export type EditDraftContentResult =
  | { status: "not_found" }
  /** The draft has already been sent; `sentAt` is immutable history, not a draft to keep tweaking. */
  | { status: "already_sent" }
  | { status: "ok"; draft: CommunicationDraft };

/**
 * Edits a draft's `content` in place and marks it `edited: true`. A draft can
 * be edited freely (any number of times, with the new content preserved
 * verbatim) right up until it is sent — once `sentAt` is set, edits are
 * rejected with `{ status: "already_sent" }` and the draft is left
 * byte-for-byte unchanged.
 *
 * Critically, the human-review gate `sendDraft` enforces is a guarantee about
 * the *content being sent*, not merely "review happened at some point". If a
 * draft was already `reviewConfirmed` and this edit actually changes its
 * content, that confirmation no longer applies to the new content — so this
 * resets `reviewConfirmed` back to `false`, requiring a fresh
 * `confirmDraftReview` call before the edited draft can be sent. An edit that
 * resubmits identical content (no-op edit) leaves `reviewConfirmed`
 * untouched.
 *
 * Returns `{ status: "not_found" }` (no mutation) when no draft with
 * `draftId` exists. Appends a `communicationDraft.edited` audit event only on
 * a successful edit.
 */
export function editDraftContent(
  store: Store,
  { draftId, content, actor }: EditDraftContentParams
): EditDraftContentResult {
  const draft = store.communicationDrafts.find((candidate) => candidate.id === draftId);
  if (!draft) {
    return { status: "not_found" };
  }
  if (draft.sentAt) {
    return { status: "already_sent" };
  }

  const contentChanged = draft.content !== content;

  draft.content = content;
  draft.edited = true;
  if (contentChanged) {
    draft.reviewConfirmed = false;
  }

  recordAuditEvent(store, {
    actor,
    entityType: "communicationDraft",
    entityId: draft.id,
    eventType: "communicationDraft.edited",
    summary: `Draft ${draft.id} edited`,
  });

  return { status: "ok", draft };
}

export interface ConfirmDraftReviewParams {
  draftId: Id;
  /** The advisor confirming review, stamped onto the resulting audit event. */
  actor: Id;
}

export type ConfirmDraftReviewResult =
  | { status: "not_found" }
  /** The draft has already been sent; confirming review on sent history is meaningless. */
  | { status: "already_sent" }
  | { status: "ok"; draft: CommunicationDraft; alreadyConfirmed: boolean };

/**
 * Sets a draft's `reviewConfirmed: true` — the *only* mechanism that does so.
 * Fetching a draft (`GET /api/opportunities/[id]/draft`, `getOrCreateDraft`)
 * never sets this flag; only this explicit confirmation satisfies the
 * human-review gate `sendDraft` enforces.
 *
 * Idempotent: re-confirming an already-confirmed draft returns `{ status:
 * "ok", alreadyConfirmed: true }` without appending a duplicate audit event.
 * Returns `{ status: "not_found" }` when no draft with `draftId` exists, and
 * `{ status: "already_sent" }` (no mutation) once the draft has been sent.
 */
export function confirmDraftReview(
  store: Store,
  { draftId, actor }: ConfirmDraftReviewParams
): ConfirmDraftReviewResult {
  const draft = store.communicationDrafts.find((candidate) => candidate.id === draftId);
  if (!draft) {
    return { status: "not_found" };
  }
  if (draft.sentAt) {
    return { status: "already_sent" };
  }
  if (draft.reviewConfirmed) {
    return { status: "ok", draft, alreadyConfirmed: true };
  }

  draft.reviewConfirmed = true;

  recordAuditEvent(store, {
    actor,
    entityType: "communicationDraft",
    entityId: draft.id,
    eventType: "communicationDraft.reviewConfirmed",
    summary: `Draft ${draft.id} review confirmed`,
  });

  return { status: "ok", draft, alreadyConfirmed: false };
}

export interface SendDraftParams {
  draftId: Id;
  /** The advisor sending the draft, stamped onto the resulting audit event. */
  actor: Id;
}

export type SendDraftResult =
  | { status: "not_found" }
  /** `reviewConfirmed` is false — the human-review gate blocks the send; the draft is left entirely unchanged. */
  | { status: "review_not_confirmed" }
  /** Sending is a one-time, terminal transition — a second send is rejected rather than re-stamping `sentAt`. */
  | { status: "already_sent"; draft: CommunicationDraft }
  | { status: "sent"; draft: CommunicationDraft };

/**
 * The simulated "send" transition: stamps `sentAt` on a draft, but only once
 * `reviewConfirmed` is `true`. If review hasn't been confirmed, returns `{
 * status: "review_not_confirmed" }` and leaves the draft completely
 * unchanged — no partial mutation, no audit event.
 *
 * Returns `{ status: "not_found" }` when no draft with `draftId` exists, and
 * `{ status: "already_sent" }` (no mutation) if the draft was already sent.
 * On success, appends a `communicationDraft.sent` audit event.
 *
 * Pending-outcome creation (in the same transaction as the send) is a
 * follow-up story's responsibility — see `src/server/lib/communication.ts`'s
 * module docs — so a successful send here only stamps `sentAt`.
 */
export function sendDraft(store: Store, { draftId, actor }: SendDraftParams): SendDraftResult {
  const draft = store.communicationDrafts.find((candidate) => candidate.id === draftId);
  if (!draft) {
    return { status: "not_found" };
  }
  if (draft.sentAt) {
    return { status: "already_sent", draft };
  }
  if (!draft.reviewConfirmed) {
    return { status: "review_not_confirmed" };
  }

  draft.sentAt = getCurrentTime().toISOString();

  recordAuditEvent(store, {
    actor,
    entityType: "communicationDraft",
    entityId: draft.id,
    eventType: "communicationDraft.sent",
    summary: `Draft ${draft.id} sent`,
  });

  return { status: "sent", draft };
}
