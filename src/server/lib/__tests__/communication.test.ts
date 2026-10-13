import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { generateDraftContent, getOrCreateDraft } from "../communication.ts";
import { loadStore } from "../../store/db.ts";
import { evaluateProgramRule } from "../../domain/rules.ts";
import type { PlaybookVersion } from "../../store/types.ts";

const originalCwd = process.cwd();
let scratchDir: string;

beforeEach(() => {
  scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "communication-test-"));
  process.chdir(scratchDir);
  globalThis.__appStore = undefined;
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(scratchDir, { recursive: true, force: true });
  globalThis.__appStore = undefined;
});

function publishedV2(store = loadStore()): PlaybookVersion {
  const version = store.playbookVersions.find((v) => v.id === "PLAYBOOK-001-V2");
  if (!version) {
    throw new Error("PLAYBOOK-001-V2 missing from seed store");
  }
  return version;
}

test("generateDraftContent is deterministic across repeated calls with the same input", () => {
  const params = { participantName: "Jordan Rivera", courseName: "Cell Biology" };

  const first = generateDraftContent(params);
  const second = generateDraftContent(params);
  const third = generateDraftContent({ ...params });

  assert.equal(first, second);
  assert.equal(first, third);
});

test("generateDraftContent only references the participant's name and course", () => {
  const content = generateDraftContent({
    participantName: "Jordan Rivera",
    courseName: "Cell Biology",
  });

  assert.ok(content.includes("Jordan Rivera"));
  assert.ok(content.includes("Cell Biology"));
});

test("generateDraftContent omits the course clause entirely when no course is given", () => {
  const withCourse = generateDraftContent({ participantName: "Jordan Rivera", courseName: "Cell Biology" });
  const withoutCourse = generateDraftContent({ participantName: "Jordan Rivera" });

  assert.notEqual(withCourse, withoutCourse);
  assert.ok(!withoutCourse.includes("Cell Biology"));
});

test("getOrCreateDraft creates DRAFT-001 with reviewConfirmed: false for OPP-001", () => {
  const store = loadStore();
  evaluateProgramRule(store, publishedV2(store));
  const opportunity = store.opportunities.find((candidate) => candidate.id === "OPP-001");
  assert.ok(opportunity);

  const { draft, created } = getOrCreateDraft(store, opportunity!);

  assert.equal(created, true);
  assert.equal(draft.id, "DRAFT-001");
  assert.equal(draft.opportunityId, "OPP-001");
  assert.equal(draft.personId, "PERSON-001");
  assert.equal(draft.edited, false);
  assert.equal(draft.reviewConfirmed, false);
  assert.ok(draft.content.includes("Jordan Rivera"));
  assert.equal(store.communicationDrafts.length, 1);

  const auditEvent = store.auditEvents.find(
    (event) => event.eventType === "communicationDraft.created"
  );
  assert.ok(auditEvent);
  assert.equal(auditEvent?.entityId, "DRAFT-001");
});

test("getOrCreateDraft is idempotent — repeated calls never create a duplicate draft", () => {
  const store = loadStore();
  evaluateProgramRule(store, publishedV2(store));
  const opportunity = store.opportunities.find((candidate) => candidate.id === "OPP-001");
  assert.ok(opportunity);

  const first = getOrCreateDraft(store, opportunity!);
  const second = getOrCreateDraft(store, opportunity!);
  const third = getOrCreateDraft(store, opportunity!);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(third.created, false);
  assert.deepEqual(second.draft, first.draft);
  assert.deepEqual(third.draft, first.draft);
  assert.equal(store.communicationDrafts.length, 1);
  assert.equal(
    store.auditEvents.filter((event) => event.eventType === "communicationDraft.created").length,
    1
  );
});
