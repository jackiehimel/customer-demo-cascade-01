/**
 * Audit-log helper.
 *
 * `recordAuditEvent` is the single mechanism every later mutation (playbook
 * publish, rule evaluation, draft send, outcome transition, etc.) uses to
 * stamp a structured, append-only `AuditEvent`. Built now so later stories
 * reuse it from day one instead of inventing ad-hoc logging.
 *
 * Audit events are plain appended array entries on the store's `auditEvents`
 * array — there is no separate storage mechanism, and prior events are never
 * mutated or removed.
 */

import { randomUUID } from "node:crypto";
import { getCurrentTime } from "./clock.ts";
import type { AuditEvent, Store } from "../store/types.ts";

/** The caller-supplied fields of an `AuditEvent` — everything except `id` and `at`, which this helper stamps. */
export type AuditEventInput = Omit<AuditEvent, "id" | "at">;

/**
 * Appends a new `AuditEvent` to `store.auditEvents`, stamped with
 * `getCurrentTime()` (the synthetic clock, never `Date.now()`) and a fresh
 * `id`. Never mutates or removes any prior event — this is purely an append.
 *
 * Does not persist the store itself; callers are responsible for calling
 * `saveStore` (typically under `withStoreLock`) once they're done mutating,
 * the same way every other store mutation works.
 */
export function recordAuditEvent(store: Store, input: AuditEventInput): AuditEvent {
  const event: AuditEvent = {
    id: `AUDIT-${randomUUID()}`,
    at: getCurrentTime().toISOString(),
    ...input,
  };

  store.auditEvents.push(event);
  return event;
}
