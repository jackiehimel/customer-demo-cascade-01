import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

let tmpDir: string;
let originalCwd: string;
let routeModule: typeof import("../route.ts");

interface DraftBody {
  id: string;
  opportunityId: string;
  personId: string;
  content: string;
  edited: boolean;
  reviewConfirmed: boolean;
  createdAt: string;
}

function get(id: string) {
  return routeModule.GET(new Request(`http://localhost/api/opportunities/${id}/draft`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "draft-route-test-"));
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

test("GET /api/opportunities/[id]/draft returns 404 for an unknown opportunity id", async () => {
  const response = await get("DOES-NOT-EXIST");
  assert.equal(response.status, 404);
  const body = (await response.json()) as { error: string };
  assert.ok(body.error.includes("DOES-NOT-EXIST"));
});

test("GET /api/opportunities/[id]/draft creates DRAFT-001 with reviewConfirmed: false for OPP-001", async () => {
  const { loadStore, saveStore } = await import("../../../../../../server/store/db.ts");
  const { evaluateProgramRule } = await import("../../../../../../server/domain/rules.ts");

  const store = loadStore();
  const publishedV2 = store.playbookVersions.find((v) => v.id === "PLAYBOOK-001-V2");
  assert.ok(publishedV2);
  evaluateProgramRule(store, publishedV2!);
  saveStore(store);

  const response = await get("OPP-001");
  assert.equal(response.status, 200);
  const body = (await response.json()) as { draft: DraftBody };

  assert.equal(body.draft.id, "DRAFT-001");
  assert.equal(body.draft.opportunityId, "OPP-001");
  assert.equal(body.draft.personId, "PERSON-001");
  assert.equal(body.draft.edited, false);
  assert.equal(body.draft.reviewConfirmed, false);
  assert.ok(body.draft.content.includes("Jordan Rivera"));
});

test("GET /api/opportunities/[id]/draft is idempotent — calling it twice never creates a duplicate draft", async () => {
  const { loadStore, saveStore } = await import("../../../../../../server/store/db.ts");
  const { evaluateProgramRule } = await import("../../../../../../server/domain/rules.ts");

  const store = loadStore();
  const publishedV2 = store.playbookVersions.find((v) => v.id === "PLAYBOOK-001-V2");
  assert.ok(publishedV2);
  evaluateProgramRule(store, publishedV2!);
  saveStore(store);

  const first = await get("OPP-001");
  const firstBody = (await first.json()) as { draft: DraftBody };

  const second = await get("OPP-001");
  const secondBody = (await second.json()) as { draft: DraftBody };

  assert.equal(firstBody.draft.id, "DRAFT-001");
  assert.deepEqual(secondBody.draft, firstBody.draft);

  const { loadStore: reloadStore } = await import("../../../../../../server/store/db.ts");
  const finalStore = reloadStore();
  assert.equal(finalStore.communicationDrafts.length, 1);
});
