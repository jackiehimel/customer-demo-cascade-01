/**
 * Synthetic clock.
 *
 * `getCurrentTime()` is the sole source of "now" for the whole app — nothing
 * else should ever call `Date.now()` or `new Date()` with no arguments.
 * "Now" is just another fact persisted in the Step-1 store (`ClockState`),
 * advanced explicitly via `advanceTo`.
 */

import { loadStore, saveStore, withStoreLock } from "../store/db.ts";
import type { IsoDateTime } from "../store/types";

/**
 * Returns the app's current synthetic time, read only from the persisted
 * `ClockState` — never from `Date.now()`.
 */
export function getCurrentTime(): Date {
  const store = loadStore();
  return new Date(store.clock.current);
}

/**
 * Advances the synthetic clock to `instant`.
 *
 * Rejects (throws) when `instant` is not strictly after the current time —
 * the clock can only move forward. On success, persists the new time.
 *
 * The outcome re-evaluation hook at this call site is a clean extension
 * point for a later story; it is intentionally not wired up yet.
 */
export async function advanceTo(instant: Date | IsoDateTime): Promise<void> {
  const target = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(target.getTime())) {
    throw new Error(`advanceTo: "${String(instant)}" is not a valid instant`);
  }

  await withStoreLock(() => {
    const store = loadStore();
    const current = new Date(store.clock.current);
    if (target.getTime() <= current.getTime()) {
      throw new Error(
        `advanceTo: instant (${target.toISOString()}) must be strictly after the current time (${store.clock.current})`
      );
    }

    store.clock.current = target.toISOString();
    saveStore(store);

    // Extension point: outcome re-evaluation is wired in here in a later
    // story (see the outcome-transition story). Intentionally a no-op now.
  });
}
