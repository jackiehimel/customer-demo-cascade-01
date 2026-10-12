/**
 * Seed fixture data.
 *
 * `createSeedStore()` is the one-stop shop for "known good" reference data —
 * stable, hand-picked IDs that every later story (synthetic clock, rule
 * engine, opportunities, drafts, outcomes) can build against without
 * guessing what's in the store. It is pure and side-effect free: it never
 * touches disk (see `db.ts` for persistence) and every call returns a brand
 * new object graph so callers can freely mutate the result without
 * corrupting a shared fixture.
 */

import type { Person, PlaybookVersion, Signal, Store } from "./types.ts";

/** The synthetic clock's starting instant — a Monday, so business-day math has headroom. */
export const T0 = "2030-01-07T14:00:00.000Z";

function isoHoursBefore(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() - hours * 60 * 60 * 1000).toISOString();
}

function createSeedPeople(): Person[] {
  return [
    {
      id: "PERSON-001",
      programId: "PROG-001",
      roleId: "ROLE-advisor",
      name: "Jordan Rivera",
      email: "jordan.rivera@example.edu",
    },
  ];
}

function createSeedPlaybookVersions(): PlaybookVersion[] {
  return [
    {
      id: "PLAYBOOK-001-V1",
      playbookId: "PLAYBOOK-001",
      version: 1,
      status: "published",
      statusHistory: [
        { status: "draft", at: isoHoursBefore(T0, 240) },
        { status: "published", at: isoHoursBefore(T0, 168) },
      ],
      rule: { id: "RULE-001-V1", threshold: 65 },
      expectedOutcome: {
        assignment: "Progress Check 1",
        submitted: true,
        businessDaysToConfirm: 3,
      },
      createdAt: isoHoursBefore(T0, 240),
      publishedAt: isoHoursBefore(T0, 168),
      publishedBy: "PERSON-001",
    },
    {
      id: "PLAYBOOK-001-V2",
      playbookId: "PLAYBOOK-001",
      version: 2,
      status: "draft",
      statusHistory: [{ status: "draft", at: isoHoursBefore(T0, 24) }],
      rule: { id: "RULE-001-V2", threshold: 75 },
      expectedOutcome: {
        assignment: "Progress Check 1",
        submitted: true,
        businessDaysToConfirm: 3,
      },
      createdAt: isoHoursBefore(T0, 24),
    },
  ];
}

function createSeedSignals(): Signal[] {
  return [
    {
      id: "SIG-001",
      personId: "PERSON-001",
      courseId: "COURSE-001",
      type: "overdue",
      value: { assignment: "Progress Check 1", daysOverdue: 2 },
      observedAt: isoHoursBefore(T0, 48),
      provenance: { source: "seed" },
    },
    {
      id: "SIG-002",
      personId: "PERSON-001",
      courseId: "COURSE-001",
      type: "grade_below_threshold",
      value: { assignment: "Quiz 1", grade: 60 },
      observedAt: isoHoursBefore(T0, 36),
      provenance: { source: "seed" },
    },
    {
      id: "SIG-003",
      personId: "PERSON-001",
      courseId: "COURSE-001",
      type: "activity",
      value: { lastActiveHoursAgo: 96 },
      observedAt: isoHoursBefore(T0, 24),
      provenance: { source: "seed" },
    },
    {
      id: "SIG-004",
      personId: "PERSON-001",
      courseId: "COURSE-001",
      type: "interaction",
      value: { channel: "email", direction: "inbound" },
      observedAt: isoHoursBefore(T0, 12),
      provenance: { source: "seed" },
    },
    // SIG-005 is intentionally NOT seeded — later stories use its absence to
    // exercise "newly observed signal" behavior against a known baseline.
  ];
}

/**
 * Builds a fresh seed `Store`. Every call returns a brand-new object graph
 * (no shared references between calls), so callers — including tests — can
 * freely mutate the result.
 */
export function createSeedStore(): Store {
  return {
    institutions: [{ id: "INST-001", name: "Riverbend State University" }],
    programs: [
      { id: "PROG-001", institutionId: "INST-001", name: "Bachelor of Science in Biology" },
    ],
    roles: [
      { id: "ROLE-administrator", key: "administrator", name: "Administrator" },
      { id: "ROLE-advisor", key: "advisor", name: "Advisor" },
    ],
    people: createSeedPeople(),
    courses: [
      { id: "COURSE-001", programId: "PROG-001", code: "BIO-201", name: "Cell Biology" },
    ],
    playbookVersions: createSeedPlaybookVersions(),
    signals: createSeedSignals(),
    conditions: [],
    opportunities: [],
    communicationDrafts: [],
    outcomes: [],
    auditEvents: [],
    clock: { current: T0 },
  };
}
