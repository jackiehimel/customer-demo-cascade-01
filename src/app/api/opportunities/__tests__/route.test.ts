import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

let tmpDir: string;
let originalCwd: string;
let routeModule: typeof import("../route.ts");

interface OpportunityListItemBody {
  id: string;
  status: string;
  priority: string;
  recommendedAction: string;
  createdAt: string;
  participant: { id: string; name: string; email?: string };
  program?: { id: string; name: string };
  course?: { id: string; code: string; name: string };
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opportunities-route-test-"));
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

test("GET /api/opportunities returns an empty list when no opportunities have been created yet", async () => {
  const response = routeModule.GET();
  assert.equal(response.status, 200);
  const body = (await response.json()) as { opportunities: OpportunityListItemBody[] };
  assert.deepEqual(body.opportunities, []);
});

test("GET /api/opportunities returns OPP-001 with denormalized participant/program/course context + priority once the rule engine has run", async () => {
  const { loadStore, saveStore } = await import("../../../../server/store/db.ts");
  const { evaluateProgramRule } = await import("../../../../server/domain/rules.ts");

  const store = loadStore();
  const publishedV2 = store.playbookVersions.find((v) => v.id === "PLAYBOOK-001-V2");
  assert.ok(publishedV2);
  evaluateProgramRule(store, publishedV2!);
  saveStore(store);

  const response = routeModule.GET();
  assert.equal(response.status, 200);
  const body = (await response.json()) as { opportunities: OpportunityListItemBody[] };
  assert.equal(body.opportunities.length, 1);

  const opportunity = body.opportunities[0]!;
  assert.equal(opportunity.id, "OPP-001");
  assert.equal(opportunity.status, "open");
  assert.equal(opportunity.priority, "high");
  assert.ok(opportunity.recommendedAction.length > 0);
  assert.ok(opportunity.createdAt);
  assert.equal(opportunity.participant.id, "PERSON-001");
  assert.equal(opportunity.participant.name, "Jordan Rivera");
  assert.equal(opportunity.program?.id, "PROG-001");
  assert.equal(opportunity.program?.name, "Bachelor of Science in Biology");
  assert.equal(opportunity.course?.id, "COURSE-001");
  assert.equal(opportunity.course?.code, "BIO-201");
});

test("GET /api/opportunities sorts by priority (high first) then recency (newest first) within a tier", async () => {
  const { loadStore, saveStore } = await import("../../../../server/store/db.ts");

  const store = loadStore();
  store.opportunities = [
    {
      id: "OPP-OLD-MEDIUM",
      conditionId: "COND-FIXTURE",
      personId: "PERSON-001",
      status: "open",
      priority: "medium",
      recommendedAction: "Follow up",
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
    {
      id: "OPP-NEW-HIGH",
      conditionId: "COND-FIXTURE",
      personId: "PERSON-001",
      status: "open",
      priority: "high",
      recommendedAction: "Reach out now",
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
      createdAt: "2030-01-03T00:00:00.000Z",
    },
    {
      id: "OPP-OLDER-HIGH",
      conditionId: "COND-FIXTURE",
      personId: "PERSON-001",
      status: "open",
      priority: "high",
      recommendedAction: "Reach out",
      explanation: {
        signalIds: [],
        conditionId: "COND-FIXTURE",
        playbookVersionId: "PLAYBOOK-001-V1",
        ruleId: "RULE-001-V1",
        thresholdUsed: 65,
        confidence: 0.85,
        rationale: "fixture",
        recommendedPosture: "proactive-outreach",
      },
      createdAt: "2030-01-02T00:00:00.000Z",
    },
  ];
  saveStore(store);

  const response = routeModule.GET();
  const body = (await response.json()) as { opportunities: OpportunityListItemBody[] };
  assert.deepEqual(
    body.opportunities.map((opportunity) => opportunity.id),
    ["OPP-NEW-HIGH", "OPP-OLDER-HIGH", "OPP-OLD-MEDIUM"]
  );
});
