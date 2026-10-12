import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

let tmpDir: string;
let originalCwd: string;
let storePath: string;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "store-db-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  delete (globalThis as { __appStore?: unknown }).__appStore;
  storePath = path.join(tmpDir, ".data", "store.json");
});

after(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("loadStore seeds a fresh store.json on first run", async () => {
  const { loadStore } = await import("../db.ts");
  const { createSeedStore } = await import("../seed.ts");

  assert.equal(fs.existsSync(storePath), false);

  const store = loadStore();
  assert.deepEqual(store, createSeedStore());
  assert.ok(fs.existsSync(storePath), "store.json should be created on first load");
});

test("loadStore never overwrites an existing store.json", async () => {
  const { loadStore } = await import("../db.ts");

  // A fresh process restart would clear the in-memory cache but the file
  // (seeded by the previous test) still exists on disk.
  delete (globalThis as { __appStore?: unknown }).__appStore;
  const onDisk = JSON.parse(fs.readFileSync(storePath, "utf-8"));
  onDisk.clock.current = "2099-01-01T00:00:00.000Z";
  fs.writeFileSync(storePath, JSON.stringify(onDisk));

  const reloaded = loadStore();
  assert.equal(reloaded.clock.current, "2099-01-01T00:00:00.000Z");
  assert.equal(reloaded.institutions.length, 1, "existing data must be preserved, not reseeded");
});
