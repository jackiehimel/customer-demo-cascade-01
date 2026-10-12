/**
 * Domain types for the JSON-file persistence layer.
 *
 * This is the single shared vocabulary every later story (seed data, the
 * synthetic clock, the rule engine, API routes, UI) builds on top of instead
 * of inventing ad-hoc shapes. Nothing in this file touches disk or process
 * state — see `db.ts` for the store itself.
 */

/** All entity ids in this app are opaque strings (e.g. "PERSON-001"). */
export type Id = string;

/** Always an ISO-8601 string produced by the synthetic clock, never `Date.now()`. */
export type IsoDateTime = string;

export interface Institution {
  id: Id;
  name: string;
}

export interface Program {
  id: Id;
  institutionId: Id;
  name: string;
}

export type RoleKey = "administrator" | "advisor";

export interface Role {
  id: Id;
  key: RoleKey;
  name: string;
}

export interface Participant {
  id: Id;
  programId: Id;
  name: string;
  email?: string;
}

export interface Course {
  id: Id;
  programId: Id;
  code: string;
  name: string;
}

export type PlaybookVersionStatus = "draft" | "published" | "superseded";

export interface PlaybookVersionStatusHistoryEntry {
  status: PlaybookVersionStatus;
  at: IsoDateTime;
  by?: Id;
}

/** The expected result of following a playbook's recommended action. */
export interface PlaybookExpectedOutcome {
  assignment: string;
  submitted: boolean;
  /** How many business days after the recommended action the outcome should resolve. */
  businessDaysToConfirm: number;
}

export interface PlaybookRule {
  id: Id;
  /** Grade threshold below which the rule fires. */
  threshold: number;
}

export interface PlaybookVersion {
  id: Id;
  playbookId: Id;
  version: number;
  status: PlaybookVersionStatus;
  /** Append-only; a version's prior statuses are preserved, never mutated away. */
  statusHistory: PlaybookVersionStatusHistoryEntry[];
  rule: PlaybookRule;
  expectedOutcome: PlaybookExpectedOutcome;
  createdAt: IsoDateTime;
  publishedAt?: IsoDateTime;
  publishedBy?: Id;
  supersededAt?: IsoDateTime;
}

export type SignalType =
  | "overdue"
  | "grade_below_threshold"
  | "activity"
  | "interaction"
  | "confirmation";

export interface SignalProvenance {
  source: string;
  fixtureVersion?: string;
}

export interface Signal {
  id: Id;
  participantId: Id;
  courseId?: Id;
  type: SignalType;
  value?: unknown;
  observedAt: IsoDateTime;
  provenance: SignalProvenance;
}

export interface Condition {
  id: Id;
  participantId: Id;
  playbookVersionId: Id;
  /** All signals that contributed to this condition (triggering + supporting context). */
  signalIds: Id[];
  createdAt: IsoDateTime;
}

export type OpportunityPriority = "high" | "medium" | "low";
export type OpportunityStatus = "open" | "resurfaced" | "closed";

/** Full backward-traceability payload powering the advisor "Why" view. */
export interface OpportunityExplanation {
  signalIds: Id[];
  conditionId: Id;
  playbookVersionId: Id;
  ruleId: Id;
  thresholdUsed: number;
  confidence: number;
  rationale: string;
  recommendedPosture: string;
}

export interface Opportunity {
  id: Id;
  conditionId: Id;
  participantId: Id;
  courseId?: Id;
  status: OpportunityStatus;
  priority: OpportunityPriority;
  recommendedAction: string;
  explanation: OpportunityExplanation;
  createdAt: IsoDateTime;
}

export interface CommunicationDraft {
  id: Id;
  opportunityId: Id;
  participantId: Id;
  content: string;
  /** True once the advisor has edited the generated content. */
  edited: boolean;
  /** Only ever set by an explicit "confirm review" action — never on open/fetch. */
  reviewConfirmed: boolean;
  createdAt: IsoDateTime;
  sentAt?: IsoDateTime;
}

export type OutcomeStatus = "pending" | "confirmed" | "resurfaced";

export interface OutcomeHistoryEntry {
  status: OutcomeStatus;
  at: IsoDateTime;
  note?: string;
}

export interface Outcome {
  id: Id;
  opportunityId: Id;
  communicationId: Id;
  expectedResult: string;
  dueAt: IsoDateTime;
  status: OutcomeStatus;
  /** Append-only transition log; entries are never overwritten or removed. */
  history: OutcomeHistoryEntry[];
}

export interface AuditEvent {
  id: Id;
  actor: string;
  entityType: string;
  entityId: Id;
  eventType: string;
  summary: string;
  at: IsoDateTime;
}

/** Backs the synthetic clock — the sole source of "now" for the whole app. */
export interface ClockState {
  current: IsoDateTime;
}

/** The full shape of store.json. */
export interface Store {
  institutions: Institution[];
  programs: Program[];
  roles: Role[];
  participants: Participant[];
  courses: Course[];
  playbookVersions: PlaybookVersion[];
  signals: Signal[];
  conditions: Condition[];
  opportunities: Opportunity[];
  communicationDrafts: CommunicationDraft[];
  outcomes: Outcome[];
  auditEvents: AuditEvent[];
  clock: ClockState;
}
