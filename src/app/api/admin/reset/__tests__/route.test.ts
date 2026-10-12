import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

let tmpDir: string;
let originalCwd: string;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reset-route-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  delete (globalThis as { __appStore?: unknown }).__appStore;
});

after(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("POST /api/admin/reset restores the exact seed snapshot regardless of prior mutations", async () => {
  const { POST } = await import("../route.ts");
  const { loadStore, saveStore } = await import("../../../../../server/store/db.ts");
  const { createSeedStore } = await import("../../../../../server/store/seed.ts");
  const { advanceTo } = await import("../../../../../server/lib/clock.ts");

  // Mutate the store: advance the clock and add a new signal.
  await advanceTo(new Date("2024-02-01T00:00:00.000Z"));
  const mutated = loadStore();
  mutated.signals.push({
    id: "SIG-999",
    participantId: "PERSON-001",
    type: "activity",
    observedAt: "2024-02-01T00:00:00.000Z",
    provenance: { source: "test" },
  });
  saveStore(mutated);

  const response = await POST();
  assert.equal(response.status, 200);

  const restored = loadStore();
  assert.deepEqual(restored, createSeedStore());

  const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".data", "store.json"), "utf-8"));
  assert.deepEqual(onDisk, createSeedStore());
});

test("repeating advance-clock-then-reset produces the same observable state each time", async () => {
  const { POST } = await import("../route.ts");
  const { loadStore } = await import("../../../../../server/store/db.ts");
  const { advanceTo } = await import("../../../../../server/lib/clock.ts");

  await advanceTo(new Date("2024-03-01T00:00:00.000Z"));
  await POST();
  // `loadStore()` returns the live, cached store object, so snapshot it
  // before the next mutation reuses the same reference.
  const first = structuredClone(loadStore());

  await advanceTo(new Date("2024-04-01T00:00:00.000Z"));
  await POST();
  const second = loadStore();

  assert.deepEqual(first, second);
});
