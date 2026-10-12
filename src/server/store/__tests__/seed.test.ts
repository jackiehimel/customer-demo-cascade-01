import assert from "node:assert/strict";
import { test } from "node:test";
import { createSeedStore } from "../seed.ts";

test("createSeedStore seeds the expected reference fixtures", () => {
  const store = createSeedStore();

  assert.ok(store.institutions.some((i) => i.id === "INST-001"));
  assert.ok(store.programs.some((p) => p.id === "PROG-001"));
  assert.ok(store.people.some((p) => p.id === "PERSON-001"));
  assert.ok(store.courses.some((c) => c.id === "COURSE-001"));

  const v1 = store.playbookVersions.find((v) => v.id === "PLAYBOOK-001-V1");
  const v2 = store.playbookVersions.find((v) => v.id === "PLAYBOOK-001-V2");
  assert.ok(v1, "PLAYBOOK-001-V1 should be seeded");
  assert.ok(v2, "PLAYBOOK-001-V2 should be seeded");
  assert.equal(v1?.status, "published");
  assert.equal(v1?.rule.threshold, 65);
  assert.equal(v2?.status, "draft");
  assert.equal(v2?.rule.threshold, 75);

  const signalIds = store.signals.map((s) => s.id).sort();
  assert.deepEqual(signalIds, ["SIG-001", "SIG-002", "SIG-003", "SIG-004"]);
  assert.ok(
    !store.signals.some((s) => s.id === "SIG-005"),
    "SIG-005 must not be seeded"
  );

  assert.equal(store.clock.current, "2030-01-07T14:00:00.000Z");
});

test("createSeedStore returns a fresh object graph on every call", () => {
  const first = createSeedStore();
  const second = createSeedStore();

  assert.notEqual(first, second);
  assert.notEqual(first.people, second.people);
  assert.notEqual(first.playbookVersions, second.playbookVersions);
  assert.notEqual(first.signals, second.signals);
  assert.notEqual(first.clock, second.clock);

  // Mutating one call's result must never leak into another call's result.
  first.signals.push({
    id: "SIG-999",
    personId: "PERSON-001",
    type: "activity",
    observedAt: first.clock.current,
    provenance: { source: "test" },
  });
  first.clock.current = "2099-01-01T00:00:00.000Z";

  assert.equal(second.signals.some((s) => s.id === "SIG-999"), false);
  assert.equal(second.clock.current, "2030-01-07T14:00:00.000Z");
});
