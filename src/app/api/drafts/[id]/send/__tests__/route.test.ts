import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import type { CommunicationDraft, PlaybookVersion } from "../../../../../../server/store/types.ts";

let tmpDir: string;
let originalCwd: string;
let routeModule: typeof import("../route.ts");

function send(id: string) {
  return routeModule.POST(new Request(`http://localhost/api/drafts/${id}/send`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "drafts-send-route-test-"));
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
  const response = await send("DOES-NOT-EXIST");
  assert.equal(response.status, 404);
});

test("POST returns 409 with an explicit message when review hasn't been confirmed, leaving the draft unchanged", async () => {
  const draft = await seedDraft();

  const { loadStore } = await import("../../../../../../server/store/db.ts");
  const before = structuredClone(loadStore());

  const response = await send(draft.id);
  assert.equal(response.status, 409);
  const body = (await response.json()) as { error: string };
  assert.ok(body.error.length > 0);

  const after = loadStore();
  assert.deepEqual(after, before);
  const persisted = after.communicationDrafts.find((d) => d.id === draft.id);
  assert.equal(persisted?.sentAt, undefined);
});

test("POST stamps sentAt once review has been confirmed", async () => {
  const draft = await seedDraft();

  const { confirmDraftReview } = await import("../../../../../../server/lib/communication.ts");
  const { loadStore, saveStore } = await import("../../../../../../server/store/db.ts");
  const store = loadStore();
  confirmDraftReview(store, { draftId: draft.id, actor: "PERSON-001" });
  saveStore(store);

  const response = await send(draft.id);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { draft: CommunicationDraft };
  assert.ok(body.draft.sentAt);
});

test("POST records a communicationDraft.sent audit event on success", async () => {
  const draft = await seedDraft();

  const { confirmDraftReview } = await import("../../../../../../server/lib/communication.ts");
  const { loadStore, saveStore } = await import("../../../../../../server/store/db.ts");
  const store = loadStore();
  confirmDraftReview(store, { draftId: draft.id, actor: "PERSON-001" });
  saveStore(store);

  await send(draft.id);

  const finalStore = loadStore();
  const event = finalStore.auditEvents.find((e) => e.eventType === "communicationDraft.sent");
  assert.ok(event);
  assert.equal(event?.entityId, draft.id);
});

test("POST returns 409 when sending an already-sent draft a second time", async () => {
  const draft = await seedDraft();

  const { confirmDraftReview } = await import("../../../../../../server/lib/communication.ts");
  const { loadStore, saveStore } = await import("../../../../../../server/store/db.ts");
  const store = loadStore();
  confirmDraftReview(store, { draftId: draft.id, actor: "PERSON-001" });
  saveStore(store);

  const first = await send(draft.id);
  assert.equal(first.status, 200);

  const second = await send(draft.id);
  assert.equal(second.status, 409);
});
