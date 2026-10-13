import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { getOpportunityDetail, listOpportunities } from "../opportunities.ts";
import { evaluateProgramRule } from "../rules.ts";
import { loadStore } from "../../store/db.ts";
import type { PlaybookVersion } from "../../store/types.ts";

const originalCwd = process.cwd();
let scratchDir: string;

beforeEach(() => {
  scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "opportunities-domain-test-"));
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

test("listOpportunities returns an empty array when the store has no opportunities", () => {
  const store = loadStore();
  assert.deepEqual(listOpportunities(store), []);
});

test("listOpportunities denormalizes participant/program/course context + priority for OPP-001", () => {
  const store = loadStore();
  evaluateProgramRule(store, publishedV2(store));

  const [item] = listOpportunities(store);
  assert.ok(item);
  assert.equal(item.id, "OPP-001");
  assert.equal(item.status, "open");
  assert.equal(item.priority, "high");
  assert.equal(item.participant.id, "PERSON-001");
  assert.equal(item.participant.name, "Jordan Rivera");
  assert.equal(item.participant.email, "jordan.rivera@example.edu");
  assert.equal(item.program?.id, "PROG-001");
  assert.equal(item.program?.name, "Bachelor of Science in Biology");
  assert.equal(item.course?.id, "COURSE-001");
  assert.equal(item.course?.code, "BIO-201");
  assert.equal(item.course?.name, "Cell Biology");
});

test("listOpportunities sorts by priority (high first) then recency (newest first)", () => {
  const store = loadStore();
  store.opportunities = [
    {
      id: "OPP-A",
      conditionId: "COND-FIXTURE",
      personId: "PERSON-001",
      status: "open",
      priority: "low",
      recommendedAction: "a",
      explanation: {
        signalIds: [],
        conditionId: "COND-FIXTURE",
        playbookVersionId: "PLAYBOOK-001-V1",
        ruleId: "RULE-001-V1",
        thresholdUsed: 65,
        confidence: 0.8,
        rationale: "fixture",
        recommendedPosture: "proactive-outreach",
      },
      createdAt: "2030-01-04T00:00:00.000Z",
    },
    {
      id: "OPP-B",
      conditionId: "COND-FIXTURE",
      personId: "PERSON-001",
      status: "open",
      priority: "high",
      recommendedAction: "b",
      explanation: {
        signalIds: [],
        conditionId: "COND-FIXTURE",
        playbookVersionId: "PLAYBOOK-001-V1",
        ruleId: "RULE-001-V1",
        thresholdUsed: 65,
        confidence: 0.9,
        rationale: "fixture",
        recommendedPosture: "proactive-outreach",
      },
      createdAt: "2030-01-01T00:00:00.000Z",
    },
    {
      id: "OPP-C",
      conditionId: "COND-FIXTURE",
      personId: "PERSON-001",
      status: "open",
      priority: "high",
      recommendedAction: "c",
      explanation: {
        signalIds: [],
        conditionId: "COND-FIXTURE",
        playbookVersionId: "PLAYBOOK-001-V1",
        ruleId: "RULE-001-V1",
        thresholdUsed: 65,
        confidence: 0.9,
        rationale: "fixture",
        recommendedPosture: "proactive-outreach",
      },
      createdAt: "2030-01-02T00:00:00.000Z",
    },
  ];

  const ids = listOpportunities(store).map((item) => item.id);
  assert.deepEqual(ids, ["OPP-C", "OPP-B", "OPP-A"]);
});

test("listOpportunities falls back gracefully when a participant is missing from the store", () => {
  const store = loadStore();
  store.opportunities = [
    {
      id: "OPP-ORPHAN",
      conditionId: "COND-FIXTURE",
      personId: "PERSON-DOES-NOT-EXIST",
      status: "open",
      priority: "medium",
      recommendedAction: "orphan",
      explanation: {
        signalIds: [],
        conditionId: "COND-FIXTURE",
        playbookVersionId: "PLAYBOOK-001-V1",
        ruleId: "RULE-001-V1",
        thresholdUsed: 65,
        confidence: 0.8,
        rationale: "fixture",
        recommendedPosture: "proactive-outreach",
      },
      createdAt: "2030-01-01T00:00:00.000Z",
    },
  ];

  const [item] = listOpportunities(store);
  assert.ok(item);
  assert.equal(item.participant.id, "PERSON-DOES-NOT-EXIST");
  assert.equal(item.program, undefined);
  assert.equal(item.course, undefined);
});

test("getOpportunityDetail returns undefined when no opportunity with the given id exists", () => {
  const store = loadStore();
  assert.equal(getOpportunityDetail(store, "OPP-DOES-NOT-EXIST"), undefined);
});

test("getOpportunityDetail resolves the full backward trace for OPP-001: condition -> signals -> playbook version -> rule", () => {
  const store = loadStore();
  evaluateProgramRule(store, publishedV2(store));

  const detail = getOpportunityDetail(store, "OPP-001");
  assert.ok(detail);
  assert.equal(detail!.id, "OPP-001");
  assert.equal(detail!.status, "open");
  assert.equal(detail!.priority, "high");
  assert.equal(detail!.participant.id, "PERSON-001");
  assert.equal(detail!.program?.id, "PROG-001");
  assert.equal(detail!.course?.id, "COURSE-001");

  assert.equal(detail!.condition.id, "COND-001");
  const signalIds = detail!.condition.signals.map((signal) => signal.id).sort();
  assert.deepEqual(signalIds, ["SIG-001", "SIG-002", "SIG-003", "SIG-004"]);
  for (const signal of detail!.condition.signals) {
    assert.equal(signal.provenance.source, "seed");
    assert.equal(typeof signal.freshnessHours, "number");
  }

  assert.equal(detail!.playbookVersion.id, "PLAYBOOK-001-V2");
  assert.equal(detail!.playbookVersion.rule.id, "RULE-001-V2");
  assert.equal(detail!.playbookVersion.rule.threshold, 75);

  assert.ok(detail!.confidence > 0);
  assert.ok(detail!.rationale.length > 0);
  assert.equal(detail!.recommendedPosture, "proactive-outreach");
});

test("getOpportunityDetail computes signal freshness in hours relative to the store's synthetic clock", () => {
  const store = loadStore();
  evaluateProgramRule(store, publishedV2(store));

  const detail = getOpportunityDetail(store, "OPP-001");
  assert.ok(detail);
  const overdueSignal = detail!.condition.signals.find((signal) => signal.id === "SIG-001");
  assert.ok(overdueSignal);
  // SIG-001 was observed 48 hours before T0 in the seed fixtures.
  assert.equal(overdueSignal!.freshnessHours, 48);
});
