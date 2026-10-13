import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import type { CommunicationDraft, PlaybookVersion } from "../../../../../server/store/types.ts";

let tmpDir: string;
let originalCwd: string;
let routeModule: typeof import("../route.ts");

function patch(id: string, content: unknown) {
  return routeModule.PATCH(
    new Request(`http://localhost/api/drafts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }),
    { params: Promise.resolve({ id }) }
  );
}

/** Publishes PLAYBOOK-001-V2 (triggering the rule engine) and fetches-or-creates DRAFT-001 for OPP-001. */
async function seedDraft(): Promise<CommunicationDraft> {
  const { loadStore, saveStore } = await import("../../../../../server/store/db.ts");
  const { evaluateProgramRule } = await import("../../../../../server/domain/rules.ts");
  const { getOrCreateDraft } = await import("../../../../../server/lib/communication.ts");

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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "drafts-patch-route-test-"));
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

test("PATCH returns 404 for an unknown draft id", async () => {
  const response = await patch("DOES-NOT-EXIST", "new content");
  assert.equal(response.status, 404);
  const body = (await response.json()) as { error: string };
  assert.ok(body.error.includes("DOES-NOT-EXIST"));
});

test("PATCH returns 422 when content is missing or not a string", async () => {
  const draft = await seedDraft();

  const missing = await patch(draft.id, undefined);
  assert.equal(missing.status, 422);

  const wrongType = await patch(draft.id, 42);
  assert.equal(wrongType.status, 422);
});

test("PATCH edits content and sets edited: true", async () => {
  const draft = await seedDraft();
  assert.equal(draft.edited, false);

  const response = await patch(draft.id, "Hi Jordan, following up personally.");
  assert.equal(response.status, 200);
  const body = (await response.json()) as { draft: CommunicationDraft };

  assert.equal(body.draft.content, "Hi Jordan, following up personally.");
  assert.equal(body.draft.edited, true);
});

test("PATCH preserves edited content verbatim, including through a subsequent send", async () => {
  const draft = await seedDraft();
  const editedContent = "Custom outreach copy —  with   odd   spacing\nand a second line.";

  const editResponse = await patch(draft.id, editedContent);
  assert.equal(editResponse.status, 200);
  const editedBody = (await editResponse.json()) as { draft: CommunicationDraft };
  assert.equal(editedBody.draft.content, editedContent);

  const { confirmDraftReview, sendDraft } = await import("../../../../../server/lib/communication.ts");
  const { loadStore, saveStore } = await import("../../../../../server/store/db.ts");
  const store = loadStore();
  confirmDraftReview(store, { draftId: draft.id, actor: "PERSON-001" });
  const sendResult = sendDraft(store, { draftId: draft.id, actor: "PERSON-001" });
  saveStore(store);

  assert.equal(sendResult.status, "sent");
  if (sendResult.status === "sent") {
    assert.equal(sendResult.draft.content, editedContent);
  }
});

test("PATCH rejects edits after the draft has been sent, leaving the draft unchanged", async () => {
  const draft = await seedDraft();

  const { confirmDraftReview, sendDraft } = await import("../../../../../server/lib/communication.ts");
  const { loadStore, saveStore } = await import("../../../../../server/store/db.ts");
  const store = loadStore();
  confirmDraftReview(store, { draftId: draft.id, actor: "PERSON-001" });
  sendDraft(store, { draftId: draft.id, actor: "PERSON-001" });
  saveStore(store);

  const before = structuredClone(loadStore());

  const response = await patch(draft.id, "trying to sneak in an edit after send");
  assert.equal(response.status, 409);

  const after = loadStore();
  assert.deepEqual(after, before);
});
