/**
 * JSON-file persistence layer.
 *
 * - The store lives at `./.data/store.json` and is cached on `globalThis` so
 *   Next.js dev-server HMR reloads reuse the same in-memory object instead of
 *   re-reading from disk on every module reload (mirrors the common
 *   Prisma-client-singleton pattern).
 * - Every write goes through a temp-file-then-rename so a crash mid-write
 *   can never leave `store.json` truncated or corrupted.
 * - `withStoreLock` provides a simple in-process write queue so concurrent
 *   read-modify-write cycles (e.g. overlapping API requests) can't interleave.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createSeedStore } from "./seed.ts";
import type { Store } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

declare global {
  // `var` is required (not `let`/`const`) to augment the `globalThis` namespace.
  var __appStore: Store | undefined;
}

function writeStoreToDisk(store: Store): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpPath = path.join(DATA_DIR, `.store.json.${process.pid}.${randomUUID()}.tmp`);
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), "utf-8");
  fs.renameSync(tmpPath, STORE_PATH);
}

/**
 * First-run semantics: `store.json` is only ever created here, and only when
 * it doesn't already exist. An existing file is always read as-is and never
 * overwritten with seed data, so re-running the app never clobbers state a
 * demo or test has accumulated.
 */
function readStoreFromDisk(): Store {
  if (!fs.existsSync(STORE_PATH)) {
    const seeded = createSeedStore();
    writeStoreToDisk(seeded);
    return seeded;
  }

  const raw = fs.readFileSync(STORE_PATH, "utf-8");
  return JSON.parse(raw) as Store;
}

/**
 * Loads the store, creating `./.data/store.json` with an empty structure if
 * it doesn't exist yet. Subsequent calls within the same process (including
 * across HMR reloads) reuse the `globalThis`-cached instance rather than
 * hitting disk again.
 */
export function loadStore(): Store {
  if (!globalThis.__appStore) {
    globalThis.__appStore = readStoreFromDisk();
  }
  return globalThis.__appStore;
}

/**
 * Persists the given store to disk atomically (write to a temp file, then
 * rename over the real path) and refreshes the `globalThis` cache so the
 * next `loadStore()` call observes the new state without re-reading disk.
 */
export function saveStore(store: Store): void {
  writeStoreToDisk(store);
  globalThis.__appStore = store;
}

let writeQueue: Promise<unknown> = Promise.resolve();

/**
 * Serializes read-modify-write cycles against the store so concurrent
 * callers (e.g. overlapping API requests) can't interleave and clobber each
 * other's writes. Typical usage:
 *
 * ```ts
 * await withStoreLock(() => {
 *   const store = loadStore();
 *   store.auditEvents.push(event);
 *   saveStore(store);
 *   return event;
 * });
 * ```
 */
export function withStoreLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const result = writeQueue.then(fn);
  // Swallow rejections in the queue chain itself so one failed mutation
  // doesn't permanently wedge the queue for subsequent callers. The actual
  // error still propagates to whoever awaits `result`.
  writeQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}
