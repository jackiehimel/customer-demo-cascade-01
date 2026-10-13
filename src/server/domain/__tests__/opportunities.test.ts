import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { listOpportunities } from "../opportunities.ts";
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
