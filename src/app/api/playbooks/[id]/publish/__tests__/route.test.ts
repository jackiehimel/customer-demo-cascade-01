import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

let tmpDir: string;
let originalCwd: string;
let routeModule: typeof import("../route.ts");

function post(id: string) {
  return routeModule.POST(new Request(`http://localhost/api/playbooks/${id}/publish`, {
    method: "POST",
  }), { params: Promise.resolve({ id }) });
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-route-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  delete (globalThis as { __appStore?: unknown }).__appStore;
  routeModule = await import("../route.ts");
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete (globalThis as { __appStore?: unknown }).__appStore;
});

test("POST publishes a valid draft, supersedes the sibling, and returns 200", async () => {
  const response = await post("PLAYBOOK-001-V2");
  assert.equal(response.status, 200);
  const body = (await response.json()) as { version: { status: string; publishedAt: string } };
  assert.equal(body.version.status, "published");
  assert.ok(body.version.publishedAt);

  const { loadStore } = await import("../../../../../../server/store/db.ts");
  const store = loadStore();
  const v1 = store.playbookVersions.find((v) => v.id === "PLAYBOOK-001-V1");
  assert.equal(v1?.status, "superseded");
});

test("POST records a playbook.published audit event on success", async () => {
  await post("PLAYBOOK-001-V2");

  const { loadStore } = await import("../../../../../../server/store/db.ts");
  const store = loadStore();
  const event = store.auditEvents.find((e) => e.eventType === "playbook.published");
  assert.ok(event);
  assert.equal(event?.entityId, "PLAYBOOK-001-V2");
  assert.equal(event?.entityType, "playbookVersion");
});

test("POST returns 422 with field errors for an invalid draft and performs zero mutation", async () => {
  const { loadStore } = await import("../../../../../../server/store/db.ts");
  const before = structuredClone(loadStore());

  const response = await post("PLAYBOOK-001-V3-INVALID");
  assert.equal(response.status, 422);
  const body = (await response.json()) as { errors: Record<string, string> };
  assert.ok(body.errors.threshold);
  assert.ok(body.errors["expectedOutcome.assignment"]);
  assert.ok(body.errors.businessDaysToConfirm);

  const after = loadStore();
  assert.deepEqual(after, before);
});

test("POST returns 404 for an unknown version id", async () => {
  const response = await post("DOES-NOT-EXIST");
  assert.equal(response.status, 404);
});

test("POST re-publishing an already-published version is idempotent: no duplicate statusHistory, no new audit event", async () => {
  const { loadStore } = await import("../../../../../../server/store/db.ts");

  const first = await post("PLAYBOOK-001-V1");
  assert.equal(first.status, 200);

  const afterFirst = structuredClone(loadStore());
  const auditCountAfterFirst = afterFirst.auditEvents.length;

  const second = await post("PLAYBOOK-001-V1");
  assert.equal(second.status, 200);

  const afterSecond = loadStore();
  assert.deepEqual(afterSecond, afterFirst);
  assert.equal(afterSecond.auditEvents.length, auditCountAfterFirst);
});
