import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

let tmpDir: string;
let originalCwd: string;
let clockModule: typeof import("../clock");

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clock-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  delete (globalThis as { __appStore?: unknown }).__appStore;
  clockModule = await import("../clock.ts");
});

after(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("getCurrentTime reads the seeded clock, never Date.now()", () => {
  const now = clockModule.getCurrentTime();
  assert.equal(now.toISOString(), "2024-01-15T09:00:00.000Z");
});

test("advanceTo persists a strictly-later instant", async () => {
  await clockModule.advanceTo(new Date("2024-01-16T09:00:00.000Z"));
  assert.equal(clockModule.getCurrentTime().toISOString(), "2024-01-16T09:00:00.000Z");

  const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".data", "store.json"), "utf-8"));
  assert.equal(onDisk.clock.current, "2024-01-16T09:00:00.000Z");
});

test("advanceTo rejects an instant that is not strictly after the current time", async () => {
  await assert.rejects(() => clockModule.advanceTo(new Date("2024-01-16T09:00:00.000Z"))); // equal
  await assert.rejects(() => clockModule.advanceTo(new Date("2024-01-15T09:00:00.000Z"))); // earlier

  // Rejected attempts must leave the persisted clock unchanged.
  assert.equal(clockModule.getCurrentTime().toISOString(), "2024-01-16T09:00:00.000Z");
});
