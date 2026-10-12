import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { publishPlaybookVersion, validatePlaybookVersion } from "../playbooks.ts";
import { advanceTo } from "../../lib/clock.ts";
import { loadStore } from "../../store/db.ts";
import type { PlaybookVersion } from "../../store/types.ts";

const originalCwd = process.cwd();
let scratchDir: string;

beforeEach(() => {
  scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "playbooks-domain-test-"));
  process.chdir(scratchDir);
  globalThis.__appStore = undefined;
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(scratchDir, { recursive: true, force: true });
  globalThis.__appStore = undefined;
});

function validVersion(overrides: Partial<PlaybookVersion> = {}): PlaybookVersion {
  return {
    id: "PLAYBOOK-TEST-V1",
    playbookId: "PLAYBOOK-TEST",
    version: 1,
    status: "draft",
    statusHistory: [{ status: "draft", at: "2030-01-01T00:00:00.000Z" }],
    rule: { id: "RULE-TEST-V1", threshold: 70 },
    expectedOutcome: {
      assignment: "Progress Check 1",
      submitted: false,
      businessDaysToConfirm: 3,
    },
    createdAt: "2030-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// --- validatePlaybookVersion -------------------------------------------------

test("validatePlaybookVersion returns no errors for a fully valid version", () => {
  const errors = validatePlaybookVersion(validVersion());
  assert.deepEqual(errors, {});
});

test("validatePlaybookVersion rejects a non-positive or non-finite threshold", () => {
  assert.ok(
    validatePlaybookVersion(validVersion({ rule: { id: "R", threshold: 0 } })).threshold
  );
  assert.ok(
    validatePlaybookVersion(validVersion({ rule: { id: "R", threshold: -5 } })).threshold
  );
  assert.ok(
    validatePlaybookVersion(validVersion({ rule: { id: "R", threshold: Infinity } })).threshold
  );
  assert.ok(
    validatePlaybookVersion(validVersion({ rule: { id: "R", threshold: Number.NaN } })).threshold
  );
});

test("validatePlaybookVersion rejects an empty or blank expectedOutcome.assignment", () => {
  const empty = validatePlaybookVersion(
    validVersion({
      expectedOutcome: { assignment: "", submitted: false, businessDaysToConfirm: 3 },
    })
  );
  assert.ok(empty["expectedOutcome.assignment"]);

  const blank = validatePlaybookVersion(
    validVersion({
      expectedOutcome: { assignment: "   ", submitted: false, businessDaysToConfirm: 3 },
    })
  );
  assert.ok(blank["expectedOutcome.assignment"]);
});

test("validatePlaybookVersion rejects a non-positive or non-integer businessDaysToConfirm", () => {
  const zero = validatePlaybookVersion(
    validVersion({
      expectedOutcome: { assignment: "A", submitted: false, businessDaysToConfirm: 0 },
    })
  );
  assert.ok(zero.businessDaysToConfirm);

  const fractional = validatePlaybookVersion(
    validVersion({
      expectedOutcome: { assignment: "A", submitted: false, businessDaysToConfirm: 1.5 },
    })
  );
  assert.ok(fractional.businessDaysToConfirm);
});

// --- publishPlaybookVersion ---------------------------------------------------

test("publishPlaybookVersion returns not_found for an unknown version id and mutates nothing", () => {
  const store = loadStore();
  const before = structuredClone(store);

  const result = publishPlaybookVersion(store, {
    versionId: "DOES-NOT-EXIST",
    publishedBy: "PERSON-001",
  });

  assert.deepEqual(result, { status: "not_found" });
  assert.deepEqual(store, before);
});

test("publishPlaybookVersion rejects an invalid draft with field errors and mutates nothing", () => {
  const store = loadStore();
  const before = structuredClone(store);

  const result = publishPlaybookVersion(store, {
    versionId: "PLAYBOOK-001-V3-INVALID",
    publishedBy: "PERSON-001",
  });

  assert.equal(result.status, "invalid");
  if (result.status === "invalid") {
    assert.ok(result.errors.threshold);
    assert.ok(result.errors["expectedOutcome.assignment"]);
    assert.ok(result.errors.businessDaysToConfirm);
  }

  // Zero mutation: the store is byte-for-byte identical to before the call.
  assert.deepEqual(store, before);
});

test("publishPlaybookVersion publishes a valid draft and leaves the superseded sibling (V1) fully intact except its superseded fields", async () => {
  await advanceTo("2030-01-08T00:00:00.000Z");
  const store = loadStore();
  const v1Before = structuredClone(store.playbookVersions.find((v) => v.id === "PLAYBOOK-001-V1"));

  const result = publishPlaybookVersion(store, {
    versionId: "PLAYBOOK-001-V2",
    publishedBy: "PERSON-001",
  });

  assert.equal(result.status, "published");
  if (result.status !== "published") {
    return;
  }
  assert.equal(result.alreadyPublished, false);
  assert.equal(result.version.status, "published");
  assert.equal(result.version.publishedAt, "2030-01-08T00:00:00.000Z");
  assert.equal(result.version.publishedBy, "PERSON-001");
  assert.deepEqual(result.version.statusHistory.at(-1), {
    status: "published",
    at: "2030-01-08T00:00:00.000Z",
    by: "PERSON-001",
  });

  const v1After = store.playbookVersions.find((v) => v.id === "PLAYBOOK-001-V1");
  assert.ok(v1Before);
  assert.ok(v1After);
  assert.equal(v1After!.status, "superseded");
  assert.equal(v1After!.supersededAt, "2030-01-08T00:00:00.000Z");
  assert.deepEqual(v1After!.statusHistory.slice(0, -1), v1Before!.statusHistory);
  assert.deepEqual(v1After!.statusHistory.at(-1), {
    status: "superseded",
    at: "2030-01-08T00:00:00.000Z",
    by: "PERSON-001",
  });

  // Everything else about V1 is byte-for-byte untouched.
  assert.equal(v1After!.id, v1Before!.id);
  assert.deepEqual(v1After!.rule, v1Before!.rule);
  assert.equal(v1After!.publishedAt, v1Before!.publishedAt);
  assert.equal(v1After!.createdAt, v1Before!.createdAt);
  assert.deepEqual(v1After!.expectedOutcome, v1Before!.expectedOutcome);
});

test("publishPlaybookVersion re-publishing an already-published version is a guarded no-op", () => {
  const store = loadStore();
  const beforeSnapshot = structuredClone(store.playbookVersions.find((v) => v.id === "PLAYBOOK-001-V1"));

  const result = publishPlaybookVersion(store, {
    versionId: "PLAYBOOK-001-V1",
    publishedBy: "PERSON-001",
  });

  assert.deepEqual(result, {
    status: "published",
    version: store.playbookVersions.find((v) => v.id === "PLAYBOOK-001-V1"),
    alreadyPublished: true,
  });

  const after = store.playbookVersions.find((v) => v.id === "PLAYBOOK-001-V1");
  assert.deepEqual(after, beforeSnapshot);
});
