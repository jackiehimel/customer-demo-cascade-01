import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { evaluateProgramRule } from "../rules.ts";
import { loadStore } from "../../store/db.ts";
import type { PlaybookVersion } from "../../store/types.ts";

const originalCwd = process.cwd();
let scratchDir: string;

beforeEach(() => {
  scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "rules-domain-test-"));
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

test("evaluateProgramRule creates exactly one COND-001/OPP-001 pair from the seed signals", () => {
  const store = loadStore();

  evaluateProgramRule(store, publishedV2(store));

  assert.equal(store.conditions.length, 1);
  assert.equal(store.opportunities.length, 1);

  const condition = store.conditions[0]!;
  assert.equal(condition.id, "COND-001");
  assert.equal(condition.personId, "PERSON-001");
  assert.equal(condition.playbookVersionId, "PLAYBOOK-001-V2");
  assert.deepEqual(condition.signalIds, ["SIG-001", "SIG-002", "SIG-003", "SIG-004"]);

  const opportunity = store.opportunities[0]!;
  assert.equal(opportunity.id, "OPP-001");
  assert.equal(opportunity.conditionId, condition.id);
  assert.equal(opportunity.personId, "PERSON-001");
  assert.equal(opportunity.priority, "high");
  assert.equal(opportunity.status, "open");
  assert.ok(opportunity.recommendedAction.length > 0);

  assert.deepEqual(opportunity.explanation.signalIds, condition.signalIds);
  assert.equal(opportunity.explanation.conditionId, condition.id);
  assert.equal(opportunity.explanation.playbookVersionId, "PLAYBOOK-001-V2");
  assert.equal(opportunity.explanation.ruleId, "RULE-001-V2");
  assert.equal(opportunity.explanation.thresholdUsed, 75);
  assert.ok(opportunity.explanation.confidence > 0 && opportunity.explanation.confidence <= 1);
  assert.ok(opportunity.explanation.rationale.includes("75"));
  assert.ok(opportunity.explanation.recommendedPosture.length > 0);
});

test("evaluateProgramRule requires both SIG-001 (overdue) and SIG-002 (grade below threshold) to fire", () => {
  const store = loadStore();
  store.signals = store.signals.filter((signal) => signal.type !== "grade_below_threshold");

  evaluateProgramRule(store, publishedV2(store));

  assert.equal(store.conditions.length, 0);
  assert.equal(store.opportunities.length, 0);
});

test("evaluateProgramRule attaches SIG-003/SIG-004 as supporting context only when present", () => {
  const store = loadStore();
  store.signals = store.signals.filter(
    (signal) => signal.type !== "activity" && signal.type !== "interaction"
  );

  evaluateProgramRule(store, publishedV2(store));

  assert.equal(store.conditions.length, 1);
  assert.deepEqual(store.conditions[0]!.signalIds, ["SIG-001", "SIG-002"]);
});

test("evaluateProgramRule records condition.created and opportunity.created audit events", () => {
  const store = loadStore();

  evaluateProgramRule(store, publishedV2(store));

  const conditionEvent = store.auditEvents.find((event) => event.eventType === "condition.created");
  const opportunityEvent = store.auditEvents.find(
    (event) => event.eventType === "opportunity.created"
  );

  assert.ok(conditionEvent);
  assert.equal(conditionEvent?.entityType, "condition");
  assert.equal(conditionEvent?.entityId, "COND-001");

  assert.ok(opportunityEvent);
  assert.equal(opportunityEvent?.entityType, "opportunity");
  assert.equal(opportunityEvent?.entityId, "OPP-001");
});

test("evaluateProgramRule is idempotent — re-running never creates duplicate conditions/opportunities", () => {
  const store = loadStore();

  evaluateProgramRule(store, publishedV2(store));
  evaluateProgramRule(store, publishedV2(store));
  evaluateProgramRule(store, publishedV2(store));

  assert.equal(store.conditions.length, 1);
  assert.equal(store.opportunities.length, 1);
  assert.equal(
    store.auditEvents.filter((event) => event.eventType === "condition.created").length,
    1
  );
  assert.equal(
    store.auditEvents.filter((event) => event.eventType === "opportunity.created").length,
    1
  );
});
