import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { recordAuditEvent } from "../../../../server/lib/audit.ts";
import { loadStore, saveStore } from "../../../../server/store/db.ts";

let tmpDir: string;
let originalCwd: string;
let routeModule: typeof import("../route.ts");

interface AuditEventBody {
  id: string;
  entityId: string;
  entityType: string;
  eventType: string;
  summary: string;
  at: string;
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-route-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  delete (globalThis as { __appStore?: unknown }).__appStore;
  routeModule = await import("../route.ts");
});

after(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  const store = loadStore();
  store.auditEvents = [];
  recordAuditEvent(store, {
    actor: "PERSON-001",
    entityType: "playbookVersion",
    entityId: "PLAYBOOK-001-V1",
    eventType: "playbook.published",
    summary: "Published playbook version 1",
  });
  recordAuditEvent(store, {
    actor: "PERSON-001",
    entityType: "playbookVersion",
    entityId: "PLAYBOOK-001-V2",
    eventType: "playbook.created",
    summary: "Created playbook version 2",
  });
  recordAuditEvent(store, {
    actor: "PERSON-001",
    entityType: "communicationDraft",
    entityId: "DRAFT-001",
    eventType: "draft.sent",
    summary: "Sent a draft",
  });
  saveStore(store);
});

test("GET /api/audit returns all events when no filters are given", async () => {
  const response = routeModule.GET(new Request("http://localhost/api/audit"));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { events: AuditEventBody[] };
  assert.equal(body.events.length, 3);
});

test("GET /api/audit filters by entityId", async () => {
  const response = routeModule.GET(
    new Request("http://localhost/api/audit?entityId=PLAYBOOK-001-V2")
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { events: AuditEventBody[] };
  assert.equal(body.events.length, 1);
  assert.equal(body.events[0]?.entityId, "PLAYBOOK-001-V2");
});

test("GET /api/audit filters by entityType", async () => {
  const response = routeModule.GET(
    new Request("http://localhost/api/audit?entityType=playbookVersion")
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { events: AuditEventBody[] };
  assert.equal(body.events.length, 2);
  assert.ok(body.events.every((event) => event.entityType === "playbookVersion"));
});

test("GET /api/audit filters by entityId and entityType together", async () => {
  const response = routeModule.GET(
    new Request(
      "http://localhost/api/audit?entityId=PLAYBOOK-001-V1&entityType=playbookVersion"
    )
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { events: AuditEventBody[] };
  assert.equal(body.events.length, 1);
  assert.equal(body.events[0]?.entityId, "PLAYBOOK-001-V1");
});

test("GET /api/audit returns an empty array when no events match the filter", async () => {
  const response = routeModule.GET(
    new Request("http://localhost/api/audit?entityId=DOES-NOT-EXIST")
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { events: AuditEventBody[] };
  assert.deepEqual(body.events, []);
});
