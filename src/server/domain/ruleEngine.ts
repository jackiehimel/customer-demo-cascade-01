/**
 * Rule engine entry point — **stubbed for this story**.
 *
 * The real implementation (turning a newly-published playbook version plus
 * observed signals into `Condition`/`Opportunity` records) lands in the next
 * story. This story only needs to guarantee that publishing a playbook
 * version *calls* evaluation, inside the same `withStoreLock` transaction as
 * the publish mutation itself, so that story can land by filling in this
 * function's body without touching the publish transaction's wiring.
 */

import type { PlaybookVersion, Store } from "../store/types.ts";

/**
 * No-op placeholder for the rule engine. Intentionally does not read or
 * write anything on `store` yet — see module docstring.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub signature matches the real implementation's future shape.
export function evaluateProgramRule(store: Store, publishedVersion: PlaybookVersion): void {
  // Intentionally empty — real evaluation logic is a future story.
}
