import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

let tmpDir: string;
let originalCwd: string;
let routeModule: typeof import("../route.ts");

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clock-route-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  delete (globalThis as { __appStore?: unknown }).__appStore;
  routeModule = await import("../route.ts");
});

after(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("GET /api/clock returns the current synthetic time", async () => {
  const response = routeModule.GET();
  assert.equal(response.status, 200);
  const body = (await response.json()) as { current: string };
  assert.equal(body.current, "2024-01-15T09:00:00.000Z");
});

test("POST /api/clock advances the clock and returns the new time", async () => {
  const request = new Request("http://localhost/api/clock", {
    method: "POST",
    body: JSON.stringify({ instant: "2024-01-16T09:00:00.000Z" }),
  });
  const response = await routeModule.POST(request);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { current: string };
  assert.equal(body.current, "2024-01-16T09:00:00.000Z");
});

test("POST /api/clock returns a 4xx + message for a non-increasing instant", async () => {
  const request = new Request("http://localhost/api/clock", {
    method: "POST",
    body: JSON.stringify({ instant: "2024-01-16T09:00:00.000Z" }), // equal to current
  });
  const response = await routeModule.POST(request);
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string };
  assert.ok(body.error.length > 0);

  // A rejected advance must not mutate the persisted clock.
  const current = routeModule.GET();
  assert.equal((await current.json()).current, "2024-01-16T09:00:00.000Z");
});

test("POST /api/clock returns 400 when instant is missing or malformed", async () => {
  const missing = await routeModule.POST(
    new Request("http://localhost/api/clock", { method: "POST", body: JSON.stringify({}) })
  );
  assert.equal(missing.status, 400);

  const malformed = await routeModule.POST(
    new Request("http://localhost/api/clock", {
      method: "POST",
      body: JSON.stringify({ instant: "not-a-date" }),
    })
  );
  assert.equal(malformed.status, 400);

  const invalidJson = await routeModule.POST(
    new Request("http://localhost/api/clock", { method: "POST", body: "not json" })
  );
  assert.equal(invalidJson.status, 400);
});
