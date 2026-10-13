import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

let tmpDir: string;
let originalCwd: string;
let routeModule: typeof import("../route.ts");

interface SignalDetailBody {
  id: string;
  type: string;
  observedAt: string;
  provenance: { source: string; fixtureVersion?: string };
  freshnessHours: number;
}

interface OpportunityDetailBody {
  id: string;
  status: string;
  priority: string;
  recommendedAction: string;
  createdAt: string;
  participant: { id: string; name: string; email?: string };
  program?: { id: string; name: string };
  course?: { id: string; code: string; name: string };
  condition: { id: string; createdAt: string; signals: SignalDetailBody[] };
  playbookVersion: {
    id: string;
    playbookId: string;
    version: number;
    status: string;
    rule: { id: string; threshold: number };
  };
  confidence: number;
  rationale: string;
  recommendedPosture: string;
}

function get(id: string) {
  return routeModule.GET(new Request(`http://localhost/api/opportunities/${id}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opportunity-detail-route-test-"));
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

test("GET /api/opportunities/[id] returns 404 for an unknown opportunity id", async () => {
  const response = await get("DOES-NOT-EXIST");
  assert.equal(response.status, 404);
  const body = (await response.json()) as { error: string };
  assert.ok(body.error.includes("DOES-NOT-EXIST"));
});

test("GET /api/opportunities/[id] resolves every FUN-007 field, correctly linked, for OPP-001", async () => {
  const { loadStore, saveStore } = await import("../../../../../server/store/db.ts");
  const { evaluateProgramRule } = await import("../../../../../server/domain/rules.ts");

  const store = loadStore();
  const publishedV2 = store.playbookVersions.find((v) => v.id === "PLAYBOOK-001-V2");
  assert.ok(publishedV2);
  evaluateProgramRule(store, publishedV2!);
  saveStore(store);

  const response = await get("OPP-001");
  assert.equal(response.status, 200);
  const body = (await response.json()) as { opportunity: OpportunityDetailBody };
  const opportunity = body.opportunity;

  // opportunity
  assert.equal(opportunity.id, "OPP-001");
  assert.equal(opportunity.status, "open");
  assert.equal(opportunity.priority, "high");
  assert.ok(opportunity.recommendedAction.length > 0);
  assert.equal(opportunity.participant.id, "PERSON-001");
  assert.equal(opportunity.participant.name, "Jordan Rivera");
  assert.equal(opportunity.program?.id, "PROG-001");
  assert.equal(opportunity.course?.id, "COURSE-001");

  // -> condition
  assert.equal(opportunity.condition.id, "COND-001");
  assert.ok(opportunity.condition.createdAt);

  // -> signals (each with provenance + freshness) — the two triggering
  // signals plus the supporting activity/interaction context the rule
  // engine attaches when present.
  assert.equal(opportunity.condition.signals.length, 4);
  const signalIds = opportunity.condition.signals.map((signal) => signal.id).sort();
  assert.deepEqual(signalIds, ["SIG-001", "SIG-002", "SIG-003", "SIG-004"]);
  for (const signal of opportunity.condition.signals) {
    assert.ok(signal.type);
    assert.ok(signal.observedAt);
    assert.equal(signal.provenance.source, "seed");
    assert.equal(typeof signal.freshnessHours, "number");
    assert.ok(signal.freshnessHours >= 0);
  }

  // -> playbook version -> rule
  assert.equal(opportunity.playbookVersion.id, "PLAYBOOK-001-V2");
  assert.equal(opportunity.playbookVersion.playbookId, "PLAYBOOK-001");
  assert.equal(opportunity.playbookVersion.version, 2);
  // This test evaluates the rule engine directly against the still-draft
  // fixture (mirroring the sibling `GET /api/opportunities` route test)
  // rather than going through the publish route, so status stays "draft".
  assert.equal(opportunity.playbookVersion.status, "draft");
  assert.equal(opportunity.playbookVersion.rule.id, "RULE-001-V2");
  assert.equal(opportunity.playbookVersion.rule.threshold, 75);

  // confidence, rationale, recommended posture
  assert.equal(typeof opportunity.confidence, "number");
  assert.ok(opportunity.confidence > 0 && opportunity.confidence <= 1);
  assert.ok(opportunity.rationale.length > 0);
  assert.equal(opportunity.recommendedPosture, "proactive-outreach");
});
