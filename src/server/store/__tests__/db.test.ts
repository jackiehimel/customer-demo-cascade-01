import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { loadStore, saveStore, withStoreLock } from "../db.ts";

const originalCwd = process.cwd();
let scratchDir: string;

beforeEach(() => {
  scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "store-db-test-"));
  process.chdir(scratchDir);
  globalThis.__appStore = undefined;
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(scratchDir, { recursive: true, force: true });
  globalThis.__appStore = undefined;
});

test("loadStore seeds store.json on first run", () => {
  const storeFile = path.join(scratchDir, ".data", "store.json");
  assert.equal(fs.existsSync(storeFile), false);

  const store = loadStore();

  assert.equal(fs.existsSync(storeFile), true);
  assert.ok(store.people.some((p) => p.id === "PERSON-001"));
  assert.equal(store.clock.current, "2030-01-07T14:00:00.000Z");
});

test("loadStore never reseeds or overwrites an existing store.json", () => {
  const first = loadStore();
  first.auditEvents.push({
    id: "AUDIT-999",
    actor: "test",
    entityType: "test",
    entityId: "TEST-1",
    eventType: "test.created",
    summary: "manual mutation",
    at: first.clock.current,
  });
  saveStore(first);

  // Force a re-read from disk, simulating a fresh process start.
  globalThis.__appStore = undefined;
  const reloaded = loadStore();

  assert.equal(reloaded.auditEvents.length, 1);
  assert.equal(reloaded.auditEvents[0]?.id, "AUDIT-999");
});

test("loadStore caches the loaded instance on globalThis.__appStore", () => {
  const first = loadStore();
  const second = loadStore();
  assert.equal(first, second);
  assert.equal(globalThis.__appStore, first);
});

test("saveStore writes atomically and updates the cache", () => {
  const store = loadStore();
  store.clock.current = "2030-01-08T00:00:00.000Z";
  saveStore(store);

  const storeFile = path.join(scratchDir, ".data", "store.json");
  const raw = fs.readFileSync(storeFile, "utf-8");
  const persisted = JSON.parse(raw);
  assert.equal(persisted.clock.current, "2030-01-08T00:00:00.000Z");

  // No leftover temp files after a successful write.
  const entries = fs.readdirSync(path.join(scratchDir, ".data"));
  assert.deepEqual(entries, ["store.json"]);
});

test("withStoreLock serializes concurrent read-modify-write cycles", async () => {
  loadStore();
  const order: number[] = [];

  const tasks = [1, 2, 3].map((n) =>
    withStoreLock(async () => {
      order.push(n);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const store = loadStore();
      store.auditEvents.push({
        id: `AUDIT-${n}`,
        actor: "test",
        entityType: "test",
        entityId: `TEST-${n}`,
        eventType: "test.created",
        summary: `task ${n}`,
        at: store.clock.current,
      });
      saveStore(store);
    })
  );

  await Promise.all(tasks);

  assert.deepEqual(order, [1, 2, 3]);
  const finalStore = loadStore();
  assert.equal(finalStore.auditEvents.length, 3);
});

test("withStoreLock still runs later tasks after an earlier task rejects", async () => {
  loadStore();

  await assert.rejects(() => withStoreLock(() => Promise.reject(new Error("boom"))));

  const result = await withStoreLock(() => "recovered");
  assert.equal(result, "recovered");
});
