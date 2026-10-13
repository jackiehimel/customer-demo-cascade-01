import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import type { CommunicationDraft, PlaybookVersion } from "../../../../../../server/store/types.ts";

let tmpDir: string;
let originalCwd: string;
let routeModule: typeof import("../route.ts");

function confirm(id: string) {
  return routeModule.POST(
    new Request(`http://localhost/api/drafts/${id}/confirm-review`, { method: "POST" }),
    { params: Promise.resolve({ id }) }
  );
}

/** Publishes PLAYBOOK-001-V2 (triggering the rule engine) and fetches-or-creates DRAFT-001 for OPP-001. */
async function seedDraft(): Promise<CommunicationDraft> {
  const { loadStore, saveStore } = await import("../../../../../../server/store/db.ts");
  const { evaluateProgramRule } = await import("../../../../../../server/domain/rules.ts");
  const { getOrCreateDraft } = await import("../../../../../../server/lib/communication.ts");

  const store = loadStore();
  const v2 = store.playbookVersions.find((v): v is PlaybookVersion => v.id === "PLAYBOOK-001-V2");
  assert.ok(v2);
  evaluateProgramRule(store, v2!);
  const opportunity = store.opportunities.find((o) => o.id === "OPP-001");
  assert.ok(opportunity);
  const { draft } = getOrCreateDraft(store, opportunity!);
  saveStore(store);
  return draft;
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "drafts-confirm-review-route-test-"));
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

test("POST returns 404 for an unknown draft id", async () => {
  const response = await confirm("DOES-NOT-EXIST");
  assert.equal(response.status, 404);
});

test("POST sets reviewConfirmed: true", async () => {
  const draft = await seedDraft();
  assert.equal(draft.reviewConfirmed, false);

  const response = await confirm(draft.id);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { draft: CommunicationDraft };
  assert.equal(body.draft.reviewConfirmed, true);
});

test("fetching the draft alone never sets reviewConfirmed", async () => {
  const draft = await seedDraft();

  const { loadStore } = await import("../../../../../../server/store/db.ts");
  const store = loadStore();
  const persisted = store.communicationDrafts.find((d) => d.id === draft.id);
  assert.equal(persisted?.reviewConfirmed, false);
});

test("POST is idempotent — confirming an already-confirmed draft stays true, no duplicate audit event", async () => {
  const draft = await seedDraft();

  await confirm(draft.id);
  const { loadStore } = await import("../../../../../../server/store/db.ts");
  const afterFirst = structuredClone(loadStore());
  const auditCount = afterFirst.auditEvents.filter(
    (e) => e.eventType === "communicationDraft.reviewConfirmed"
  ).length;

  const second = await confirm(draft.id);
  assert.equal(second.status, 200);

  const afterSecond = loadStore();
  assert.equal(afterSecond.auditEvents.filter(
    (e) => e.eventType === "communicationDraft.reviewConfirmed"
  ).length, auditCount);
});

test("POST returns 409 once the draft has already been sent", async () => {
  const draft = await seedDraft();

  const { confirmDraftReview, sendDraft } = await import(
    "../../../../../../server/lib/communication.ts"
  );
  const { loadStore, saveStore } = await import("../../../../../../server/store/db.ts");
  const store = loadStore();
  confirmDraftReview(store, { draftId: draft.id, actor: "PERSON-001" });
  sendDraft(store, { draftId: draft.id, actor: "PERSON-001" });
  saveStore(store);

  const response = await confirm(draft.id);
  assert.equal(response.status, 409);
});
