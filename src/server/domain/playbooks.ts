/**
 * Playbook version publication domain logic (QUAL-003 validation + the
 * version-preserving publish transaction).
 *
 * `publishPlaybookVersion` is the single mechanism that transitions a draft
 * playbook version to `"published"`. It is deliberately store-shape-only: it
 * never touches disk itself (callers persist via `saveStore`, typically
 * inside `withStoreLock` — see `src/server/store/db.ts`) and never throws for
 * expected failure cases (not found, invalid input) — those are reported via
 * the returned result's `status` so callers (e.g. the publish API route) can
 * map them to the right HTTP status without a try/catch.
 */

import type { Id, PlaybookVersion, Store } from "../store/types.ts";
import { getCurrentTime } from "../lib/clock.ts";

/** Field-keyed validation errors, keyed by the same dotted path an API consumer would address. */
export type PlaybookVersionFieldErrors = Partial<
  Record<"threshold" | "expectedOutcome.assignment" | "businessDaysToConfirm", string>
>;

/**
 * Validates the fields of a playbook version that matter for publication
 * (QUAL-003): `rule.threshold` must be a positive finite number,
 * `expectedOutcome.assignment` must be a non-empty string, and
 * `expectedOutcome.businessDaysToConfirm` must be a positive integer.
 *
 * Returns a field-keyed error object (empty when the version is valid) —
 * never throws. Pure: never mutates `version` or reads/writes the store.
 */
export function validatePlaybookVersion(version: PlaybookVersion): PlaybookVersionFieldErrors {
  const errors: PlaybookVersionFieldErrors = {};

  const threshold = version.rule?.threshold;
  if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold <= 0) {
    errors.threshold = "threshold must be a positive finite number";
  }

  const assignment = version.expectedOutcome?.assignment;
  if (typeof assignment !== "string" || assignment.trim().length === 0) {
    errors["expectedOutcome.assignment"] = "expectedOutcome.assignment must be a non-empty string";
  }

  const businessDaysToConfirm = version.expectedOutcome?.businessDaysToConfirm;
  if (
    typeof businessDaysToConfirm !== "number" ||
    !Number.isInteger(businessDaysToConfirm) ||
    businessDaysToConfirm <= 0
  ) {
    errors.businessDaysToConfirm =
      "expectedOutcome.businessDaysToConfirm must be a positive integer";
  }

  return errors;
}

export interface PublishPlaybookVersionParams {
  /** The playbook version being published (its own `id`, e.g. "PLAYBOOK-001-V2"). */
  versionId: Id;
  /** The person triggering the publish, stamped onto `publishedAt`/`statusHistory`. */
  publishedBy: Id;
}

export type PublishPlaybookVersionResult =
  | { status: "not_found" }
  | { status: "invalid"; errors: PlaybookVersionFieldErrors }
  | { status: "published"; version: PlaybookVersion; alreadyPublished: boolean };

/**
 * Publishes a playbook version inside `store`, in place.
 *
 * - Looks up the target version by `versionId`; returns `{ status:
 *   "not_found" }` (no mutation) if it doesn't exist.
 * - Validates the target via `validatePlaybookVersion` *before* any
 *   mutation; returns `{ status: "invalid", errors }` (no mutation at all,
 *   not even to a sibling) when invalid.
 * - Idempotent: if the target is already `"published"`, returns `{ status:
 *   "published", alreadyPublished: true }` without re-stamping
 *   `publishedAt`/`publishedBy` or appending a duplicate `statusHistory`
 *   entry, and without touching any sibling.
 * - Otherwise, the currently-published sibling of the same `playbookId` (if
 *   any) transitions to `"superseded"` — only `status`, `supersededAt`, and
 *   `statusHistory` change; its `id`, prior `statusHistory` entries, `rule`,
 *   and `publishedAt` are left byte-for-byte intact. The target transitions
 *   to `"published"` with `publishedAt`/`publishedBy` stamped and a new
 *   `statusHistory` entry appended.
 *
 * Callers are responsible for persisting the store (e.g. `saveStore` inside
 * `withStoreLock`) once this returns `"published"`.
 */
export function publishPlaybookVersion(
  store: Store,
  { versionId, publishedBy }: PublishPlaybookVersionParams
): PublishPlaybookVersionResult {
  const target = store.playbookVersions.find((version) => version.id === versionId);
  if (!target) {
    return { status: "not_found" };
  }

  const errors = validatePlaybookVersion(target);
  if (Object.keys(errors).length > 0) {
    return { status: "invalid", errors };
  }

  if (target.status === "published") {
    return { status: "published", version: target, alreadyPublished: true };
  }

  const now = getCurrentTime().toISOString();

  const sibling = store.playbookVersions.find(
    (version) =>
      version.playbookId === target.playbookId &&
      version.id !== target.id &&
      version.status === "published"
  );
  if (sibling) {
    sibling.status = "superseded";
    sibling.supersededAt = now;
    sibling.statusHistory = [
      ...sibling.statusHistory,
      { status: "superseded", at: now, by: publishedBy },
    ];
  }

  target.status = "published";
  target.publishedAt = now;
  target.publishedBy = publishedBy;
  target.statusHistory = [...target.statusHistory, { status: "published", at: now, by: publishedBy }];

  return { status: "published", version: target, alreadyPublished: false };
}
