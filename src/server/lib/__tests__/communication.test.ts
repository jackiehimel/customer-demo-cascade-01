import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import {
  confirmDraftReview,
  editDraftContent,
  generateDraftContent,
  getOrCreateDraft,
  sendDraft,
} from "../communication.ts";
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

function seedDraft(store = loadStore()) {
  evaluateProgramRule(store, publishedV2(store));
  const opportunity = store.opportunities.find((candidate) => candidate.id === "OPP-001");
  if (!opportunity) {
    throw new Error("OPP-001 missing after evaluating the rule engine");
  }
  return getOrCreateDraft(store, opportunity).draft;
}

test("editDraftContent edits content and sets edited: true", () => {
  const store = loadStore();
  const draft = seedDraft(store);

  const result = editDraftContent(store, { draftId: draft.id, content: "Updated copy.", actor: "PERSON-001" });

  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    assert.equal(result.draft.content, "Updated copy.");
    assert.equal(result.draft.edited, true);
  }
  const event = store.auditEvents.find((e) => e.eventType === "communicationDraft.edited");
  assert.ok(event);
  assert.equal(event?.entityId, draft.id);
});

test("editDraftContent returns not_found for an unknown draft id", () => {
  const store = loadStore();
  const result = editDraftContent(store, { draftId: "DOES-NOT-EXIST", content: "x", actor: "PERSON-001" });
  assert.equal(result.status, "not_found");
});

test("editDraftContent rejects edits once the draft has been sent, leaving it unchanged", () => {
  const store = loadStore();
  const draft = seedDraft(store);
  confirmDraftReview(store, { draftId: draft.id, actor: "PERSON-001" });
  sendDraft(store, { draftId: draft.id, actor: "PERSON-001" });
  const before = structuredClone(store);

  const result = editDraftContent(store, { draftId: draft.id, content: "too late", actor: "PERSON-001" });

  assert.equal(result.status, "already_sent");
  assert.deepEqual(store, before);
});

test("confirmDraftReview sets reviewConfirmed: true and is idempotent", () => {
  const store = loadStore();
  const draft = seedDraft(store);

  const first = confirmDraftReview(store, { draftId: draft.id, actor: "PERSON-001" });
  assert.equal(first.status, "ok");
  if (first.status === "ok") {
    assert.equal(first.draft.reviewConfirmed, true);
    assert.equal(first.alreadyConfirmed, false);
  }

  const auditCount = store.auditEvents.filter(
    (e) => e.eventType === "communicationDraft.reviewConfirmed"
  ).length;

  const second = confirmDraftReview(store, { draftId: draft.id, actor: "PERSON-001" });
  assert.equal(second.status, "ok");
  if (second.status === "ok") {
    assert.equal(second.alreadyConfirmed, true);
  }
  assert.equal(
    store.auditEvents.filter((e) => e.eventType === "communicationDraft.reviewConfirmed").length,
    auditCount
  );
});

test("sendDraft returns review_not_confirmed and leaves the draft unchanged when reviewConfirmed is false", () => {
  const store = loadStore();
  const draft = seedDraft(store);
  const before = structuredClone(store);

  const result = sendDraft(store, { draftId: draft.id, actor: "PERSON-001" });

  assert.equal(result.status, "review_not_confirmed");
  assert.deepEqual(store, before);
});

test("sendDraft stamps sentAt once reviewConfirmed is true, and rejects a second send", () => {
  const store = loadStore();
  const draft = seedDraft(store);
  confirmDraftReview(store, { draftId: draft.id, actor: "PERSON-001" });

  const result = sendDraft(store, { draftId: draft.id, actor: "PERSON-001" });
  assert.equal(result.status, "sent");
  if (result.status === "sent") {
    assert.ok(result.draft.sentAt);
  }

  const second = sendDraft(store, { draftId: draft.id, actor: "PERSON-001" });
  assert.equal(second.status, "already_sent");
});
