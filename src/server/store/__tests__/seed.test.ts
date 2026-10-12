import assert from "node:assert/strict";
import { test } from "node:test";
import { createSeedStore, SEED_FIXTURE_VERSION } from "../seed.ts";

test("createSeedStore returns the expected day-one world", () => {
  const store = createSeedStore();

  assert.deepEqual(
    store.institutions.map((i) => i.id),
    ["INST-001"]
  );
  assert.deepEqual(
    store.programs.map((p) => p.id),
    ["PROG-001"]
  );
  assert.deepEqual(
    store.roles.map((r) => r.id).sort(),
    ["ROLE-ADMIN-001", "ROLE-ADVISOR-001"]
  );
  assert.deepEqual(
    store.participants.map((p) => p.id),
    ["PERSON-001"]
  );
  assert.deepEqual(
    store.courses.map((c) => c.id),
    ["COURSE-001"]
  );

  const v1 = store.playbookVersions.find((v) => v.id === "PLAYBOOK-001-V1");
  const v2 = store.playbookVersions.find((v) => v.id === "PLAYBOOK-001-V2");
  assert.ok(v1, "PLAYBOOK-001-V1 should be seeded");
  assert.ok(v2, "PLAYBOOK-001-V2 should be seeded");
  assert.equal(v1?.status, "published");
  assert.equal(v1?.rule.threshold, 65);
  assert.equal(v2?.status, "draft");
  assert.equal(v2?.rule.threshold, 75);
  assert.equal(v2?.expectedOutcome.submitted, true);
  assert.equal(v2?.expectedOutcome.businessDaysToConfirm, 3);

  assert.deepEqual(
    store.signals.map((s) => s.id),
    ["SIG-001", "SIG-002", "SIG-003", "SIG-004"]
  );
  assert.ok(store.signals.every((s) => s.provenance.fixtureVersion === SEED_FIXTURE_VERSION));

  // SIG-005 is intentionally not seeded — it's applied later via a dedicated endpoint.
  assert.ok(!store.signals.some((s) => s.id === "SIG-005"));
});

test("createSeedStore is deterministic across calls", () => {
  assert.deepEqual(createSeedStore(), createSeedStore());
});

test("createSeedStore returns a fresh signals array each call, not a shared reference", () => {
  // Every array field on the seed store must be a fresh copy per call so that
  // in-place mutation of one caller's store (e.g. `store.signals.push(...)`,
  // the pattern `db.ts`'s own JSDoc recommends) can never leak into a later
  // `createSeedStore()` call, such as the one `POST /api/admin/reset` relies
  // on to restore the true "day one" world.
  const first = createSeedStore();
  first.signals.push({
    id: "SIG-999",
    participantId: "PERSON-001",
    type: "activity",
    observedAt: "2024-02-01T00:00:00.000Z",
    provenance: { source: "test" },
  });

  const second = createSeedStore();
  assert.deepEqual(
    second.signals.map((s) => s.id),
    ["SIG-001", "SIG-002", "SIG-003", "SIG-004"]
  );
});
