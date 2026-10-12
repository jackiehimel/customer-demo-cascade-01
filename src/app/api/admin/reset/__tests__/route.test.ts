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

  // Capture the pristine seed snapshot *before* any mutation touches the
  // store. Comparing `restored` against a `createSeedStore()` call made
  // *after* the mutation below would be a false positive if `createSeedStore`
  // ever returned a shared array reference: the in-place `.push()` would
  // corrupt that later call's output identically, so the comparison would
  // trivially pass even though reset didn't actually restore the true seed.
  const pristineSeed = structuredClone(createSeedStore());

  // Mutate the store: advance the clock (forward, as the synthetic clock
  // requires) and add a new signal via the exact in-place-push pattern
  // `db.ts`'s own JSDoc recommends for future stories.
  await advanceTo(new Date("2030-02-01T00:00:00.000Z"));
  const mutated = loadStore();
  mutated.signals.push({
    id: "SIG-999",
    personId: "PERSON-001",
    type: "activity",
    observedAt: "2030-02-01T00:00:00.000Z",
    provenance: { source: "test" },
  });
  saveStore(mutated);

  const response = await POST();
  assert.equal(response.status, 200);

  const restored = loadStore();
  assert.deepEqual(restored, pristineSeed);
  assert.ok(
    !restored.signals.some((candidate) => candidate.id === "SIG-999"),
    "reset must not leak a signal pushed onto a previously loaded store"
  );

  const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".data", "store.json"), "utf-8"));
  assert.deepEqual(onDisk, pristineSeed);
});

test("repeating advance-clock-then-reset produces the same observable state each time", async () => {
  const { POST } = await import("../route.ts");
  const { loadStore } = await import("../../../../../server/store/db.ts");
  const { advanceTo } = await import("../../../../../server/lib/clock.ts");

  await advanceTo(new Date("2030-03-01T00:00:00.000Z"));
  await POST();
  // `loadStore()` returns the live, cached store object, so snapshot it
  // before the next mutation reuses the same reference.
  const first = structuredClone(loadStore());

  await advanceTo(new Date("2030-04-01T00:00:00.000Z"));
  await POST();
  const second = loadStore();

  assert.deepEqual(first, second);
});
