import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { advanceTo, getCurrentTime } from "../clock.ts";

const originalCwd = process.cwd();
let scratchDir: string;

beforeEach(() => {
  scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "clock-test-"));
  process.chdir(scratchDir);
  globalThis.__appStore = undefined;
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(scratchDir, { recursive: true, force: true });
  globalThis.__appStore = undefined;
});

test("getCurrentTime reads the seeded clock value, never Date.now()", () => {
  const now = getCurrentTime();
  assert.equal(now.toISOString(), "2030-01-07T14:00:00.000Z");
});

test("advanceTo rejects an instant that is not strictly after the current time", async () => {
  await assert.rejects(() => advanceTo(new Date("2030-01-07T14:00:00.000Z"))); // equal
  await assert.rejects(() => advanceTo(new Date("2030-01-06T00:00:00.000Z"))); // earlier

  // Rejected attempts must leave the persisted clock unchanged.
  assert.equal(getCurrentTime().toISOString(), "2030-01-07T14:00:00.000Z");
});

test("advanceTo persists a strictly-later instant", async () => {
  await advanceTo(new Date("2030-01-08T09:00:00.000Z"));
  assert.equal(getCurrentTime().toISOString(), "2030-01-08T09:00:00.000Z");

  const onDisk = JSON.parse(fs.readFileSync(path.join(scratchDir, ".data", "store.json"), "utf-8"));
  assert.equal(onDisk.clock.current, "2030-01-08T09:00:00.000Z");
});
