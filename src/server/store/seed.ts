/**
 * Seed fixtures — the exact "day one" world every later story's demo and
 * tests assume.
 *
 * Everything here is a literal, hand-written constant: ids, timestamps and
 * provenance are stable across runs so demo scenarios stay deterministic and
 * reproducible. Nothing in this file touches `Date.now()` or the synthetic
 * clock in `../lib/clock` — the clock's starting value is itself just another
 * seeded fact (`createSeedStore().clock.current`).
 *
 * `SIG-005` is intentionally **NOT** seeded here — it's applied later via a
 * dedicated endpoint.
 */

import type {
  Course,
  Institution,
  Participant,
  PlaybookVersion,
  Program,
  Role,
  Signal,
  SignalType,
  Store,
} from "./types";

/** Stamped into every seeded signal's provenance so seed data is always traceable. */
export const SEED_FIXTURE_VERSION = "seed-2024.01";

const INSTITUTION: Institution = {
  id: "INST-001",
  name: "Riverbend State University",
};

const PROGRAM: Program = {
  id: "PROG-001",
  institutionId: INSTITUTION.id,
  name: "Bachelor of Science in Biology",
};

const ROLE_ADMIN: Role = {
  id: "ROLE-ADMIN-001",
  key: "administrator",
  name: "Administrator",
};

const ROLE_ADVISOR: Role = {
  id: "ROLE-ADVISOR-001",
  key: "advisor",
  name: "Advisor",
};

const PARTICIPANT: Participant = {
  id: "PERSON-001",
  programId: PROGRAM.id,
  name: "Jordan Rivera",
  email: "jordan.rivera@example.edu",
};

const COURSE: Course = {
  id: "COURSE-001",
  programId: PROGRAM.id,
  code: "BIO-101",
  name: "Introduction to Biology",
};

const PLAYBOOK_ID = "PLAYBOOK-001";

/** Published version: the rule currently live for participants. */
const PLAYBOOK_V1: PlaybookVersion = {
  id: "PLAYBOOK-001-V1",
  playbookId: PLAYBOOK_ID,
  version: 1,
  status: "published",
  statusHistory: [
    { status: "draft", at: "2024-01-02T09:00:00.000Z" },
    { status: "published", at: "2024-01-05T09:00:00.000Z", by: ROLE_ADMIN.id },
  ],
  rule: { id: "RULE-001-V1", threshold: 65 },
  expectedOutcome: {
    assignment: "Homework 1",
    submitted: true,
    businessDaysToConfirm: 3,
  },
  createdAt: "2024-01-02T09:00:00.000Z",
  publishedAt: "2024-01-05T09:00:00.000Z",
  publishedBy: ROLE_ADMIN.id,
};

/** Draft version: a stricter threshold under review, not yet live. */
const PLAYBOOK_V2: PlaybookVersion = {
  id: "PLAYBOOK-001-V2",
  playbookId: PLAYBOOK_ID,
  version: 2,
  status: "draft",
  statusHistory: [{ status: "draft", at: "2024-01-10T09:00:00.000Z" }],
  rule: { id: "RULE-001-V2", threshold: 75 },
  expectedOutcome: {
    assignment: "Homework 1",
    submitted: true,
    businessDaysToConfirm: 3,
  },
  createdAt: "2024-01-10T09:00:00.000Z",
};

function signal(id: string, type: SignalType, observedAt: string, value?: unknown): Signal {
  return {
    id,
    participantId: PARTICIPANT.id,
    courseId: COURSE.id,
    type,
    ...(value !== undefined ? { value } : {}),
    observedAt,
    provenance: { source: "seed", fixtureVersion: SEED_FIXTURE_VERSION },
  };
}

const SIGNALS: Signal[] = [
  signal("SIG-001", "overdue", "2024-01-08T09:00:00.000Z"),
  signal("SIG-002", "grade_below_threshold", "2024-01-09T09:00:00.000Z", 60),
  signal("SIG-003", "activity", "2024-01-10T09:00:00.000Z", "logged_in"),
  signal("SIG-004", "interaction", "2024-01-11T09:00:00.000Z", "advisor_outreach"),
];

/**
 * Builds the deterministic seed world used the very first time the app runs
 * (see `loadStore` in `./db`, which only calls this when `store.json` is
 * absent). Every id, timestamp and provenance value is a stable literal so
 * re-seeding a fresh environment always produces byte-identical fixtures.
 */
export function createSeedStore(): Store {
  return {
    institutions: [INSTITUTION],
    programs: [PROGRAM],
    roles: [ROLE_ADMIN, ROLE_ADVISOR],
    participants: [PARTICIPANT],
    courses: [COURSE],
    playbookVersions: [PLAYBOOK_V1, PLAYBOOK_V2],
    // Fresh copy — `SIGNALS` is a module-level constant shared across every
    // call, so returning it directly would let a caller's in-place mutation
    // (e.g. `store.signals.push(...)`, the documented store-mutation pattern)
    // permanently corrupt every future seed snapshot for the life of the
    // process, including the one `POST /api/admin/reset` relies on.
    signals: [...SIGNALS],
    conditions: [],
    opportunities: [],
    communicationDrafts: [],
    outcomes: [],
    auditEvents: [],
    clock: { current: "2024-01-15T09:00:00.000Z" },
  };
}
