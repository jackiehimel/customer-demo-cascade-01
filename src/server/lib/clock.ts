/**
 * Synthetic clock.
 *
 * `getCurrentTime()` is the sole source of "now" for the whole app — nothing
 * else should ever call `Date.now()` or `new Date()` with no arguments.
 * "Now" is just another fact persisted in the store's `ClockState`, advanced
 * explicitly and only forward via `advanceTo`.
 */

import { loadStore, saveStore, withStoreLock } from "../store/db.ts";
import type { IsoDateTime } from "../store/types.ts";

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
 * the clock can only move forward, never backward or in place. On success,
 * persists the new time under `withStoreLock` so concurrent callers can't
 * interleave.
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

    // Extension point for Step 13 (resurfacing): once outcomes can go
    // overdue, this is where re-evaluating pending outcomes against the new
    // "now" is hooked in. Intentionally a no-op here — do not wire it up as
    // part of this story.
  });
}
