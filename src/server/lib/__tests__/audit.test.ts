import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { recordAuditEvent } from "../audit.ts";
import { advanceTo } from "../clock.ts";
import { loadStore, saveStore } from "../../store/db.ts";

const originalCwd = process.cwd();
let scratchDir: string;

beforeEach(() => {
  scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-test-"));
  process.chdir(scratchDir);
  globalThis.__appStore = undefined;
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(scratchDir, { recursive: true, force: true });
  globalThis.__appStore = undefined;
});

test("recordAuditEvent stamps the event with the current synthetic time and an id", () => {
  const store = loadStore();

  const event = recordAuditEvent(store, {
    actor: "PERSON-001",
    entityType: "playbookVersion",
    entityId: "PLAYBOOK-001-V2",
    eventType: "playbook.published",
    summary: "Published playbook version 2",
  });

  assert.ok(event.id.length > 0);
  assert.equal(event.at, "2030-01-07T14:00:00.000Z");
  assert.equal(event.actor, "PERSON-001");
  assert.equal(event.entityType, "playbookVersion");
  assert.equal(event.entityId, "PLAYBOOK-001-V2");
  assert.equal(event.eventType, "playbook.published");
  assert.equal(event.summary, "Published playbook version 2");
});

test("recordAuditEvent only appends — it never mutates or removes prior events", () => {
  const store = loadStore();

  const first = recordAuditEvent(store, {
    actor: "PERSON-001",
    entityType: "playbookVersion",
    entityId: "PLAYBOOK-001-V1",
    eventType: "playbook.created",
    summary: "Created playbook version 1",
  });
  saveStore(store);

  recordAuditEvent(store, {
    actor: "PERSON-001",
    entityType: "playbookVersion",
    entityId: "PLAYBOOK-001-V2",
    eventType: "playbook.created",
    summary: "Created playbook version 2",
  });
  saveStore(store);

  assert.equal(store.auditEvents.length, 2);
  assert.deepEqual(store.auditEvents[0], first);
});

test("recordAuditEvent records events in chronological order as the clock advances", async () => {
  const store = loadStore();

  recordAuditEvent(store, {
    actor: "PERSON-001",
    entityType: "playbookVersion",
    entityId: "PLAYBOOK-001-V1",
    eventType: "playbook.created",
    summary: "First event",
  });

  await advanceTo("2030-01-08T00:00:00.000Z");

  recordAuditEvent(store, {
    actor: "PERSON-001",
    entityType: "playbookVersion",
    entityId: "PLAYBOOK-001-V2",
    eventType: "playbook.created",
    summary: "Second event",
  });

  assert.equal(store.auditEvents.length, 2);
  const [earlier, later] = store.auditEvents;
  assert.ok(new Date(earlier!.at).getTime() < new Date(later!.at).getTime());
});
