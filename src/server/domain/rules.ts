/**
 * Signal → Condition → Opportunity rule engine.
 *
 * `evaluateProgramRule` is the "governed logic" of the demo: it turns a
 * newly-published playbook version plus the signals already observed in the
 * store into concrete `Condition`/`Opportunity` records, so the Command
 * Center (a later story) has something real to list and the Why view (a
 * later story) has a full backward-traceability trail to show.
 *
 * Pure over `Store` state: this function only reads/writes `store` (plus
 * appending audit events via `recordAuditEvent`) and never touches disk or
 * any other side-effecting mechanism itself — callers (e.g. the playbook
 * publish route) are responsible for persisting the store, typically inside
 * the same `withStoreLock` transaction as the publish mutation.
 */

import { recordAuditEvent } from "../lib/audit.ts";
import { getCurrentTime } from "../lib/clock.ts";
import type { Condition, Id, Opportunity, PlaybookVersion, Signal, Store } from "../store/types.ts";

/** The rule engine acts autonomously, not on behalf of any seeded `Person`. */
const SYSTEM_ACTOR = "system";

/**
 * Returns the next sequential id for `prefix` (e.g. `"COND-001"`,
 * `"OPP-002"`), based on the highest existing numeric suffix among
 * `existingIds` that match `${prefix}-<digits>`. Starts at 1 when no
 * existing id matches.
 */
function nextSequentialId(prefix: string, existingIds: Id[]): Id {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let highest = 0;
  for (const id of existingIds) {
    const match = pattern.exec(id);
    if (match) {
      highest = Math.max(highest, Number(match[1]));
    }
  }
  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
}

/** Best-effort extraction of a human-readable assignment name off a signal's untyped `value`. */
function assignmentNameFromSignal(signal: Signal): string | undefined {
  const value = signal.value;
  if (value && typeof value === "object" && "assignment" in value) {
    const assignment = (value as { assignment?: unknown }).assignment;
    return typeof assignment === "string" ? assignment : undefined;
  }
  return undefined;
}

/** Best-effort extraction of a numeric grade off a signal's untyped `value`. */
function gradeFromSignal(signal: Signal): number | undefined {
  const value = signal.value;
  if (value && typeof value === "object" && "grade" in value) {
    const grade = (value as { grade?: unknown }).grade;
    return typeof grade === "number" ? grade : undefined;
  }
  return undefined;
}

/**
 * Evaluates the governed rule for `publishedVersion` against every signal
 * currently in `store`, creating `Condition`/`Opportunity` records for any
 * person whose signals satisfy the rule.
 *
 * - Firing requires both an `"overdue"` signal (SIG-001 in the seed data)
 *   and a `"grade_below_threshold"` signal (SIG-002) for the same person —
 *   without both, no condition is created for that person.
 * - When present, that person's `"activity"` (SIG-003) and `"interaction"`
 *   (SIG-004) signals attach to the condition as supporting context — they
 *   are never required to fire the rule.
 * - Idempotent: if a `Condition` already exists for the same `personId` +
 *   `publishedVersion.id` pair, evaluation skips that person entirely (no
 *   duplicate condition or opportunity), so re-triggering evaluation (e.g.
 *   via reset-then-republish, or an accidental double call) never creates
 *   duplicates.
 * - Every created `Condition`/`Opportunity` is also recorded as a
 *   `condition.created` / `opportunity.created` audit event via
 *   `recordAuditEvent`.
 */
export function evaluateProgramRule(store: Store, publishedVersion: PlaybookVersion): void {
  const signalsByPerson = new Map<Id, Signal[]>();
  for (const signal of store.signals) {
    const existing = signalsByPerson.get(signal.personId);
    if (existing) {
      existing.push(signal);
    } else {
      signalsByPerson.set(signal.personId, [signal]);
    }
  }

  for (const [personId, signals] of signalsByPerson) {
    const overdueSignal = signals.find((signal) => signal.type === "overdue");
    const gradeSignal = signals.find((signal) => signal.type === "grade_below_threshold");

    // Both triggering signals are required — SIG-003/SIG-004-style signals
    // never fire the rule on their own.
    if (!overdueSignal || !gradeSignal) {
      continue;
    }

    const alreadyEvaluated = store.conditions.some(
      (condition) =>
        condition.personId === personId && condition.playbookVersionId === publishedVersion.id
    );
    if (alreadyEvaluated) {
      continue;
    }

    const supportingSignals = signals.filter(
      (signal) => signal.type === "activity" || signal.type === "interaction"
    );
    const signalIds = [overdueSignal.id, gradeSignal.id, ...supportingSignals.map((signal) => signal.id)];
    const now = getCurrentTime().toISOString();

    const condition: Condition = {
      id: nextSequentialId("COND", store.conditions.map((existing) => existing.id)),
      personId,
      playbookVersionId: publishedVersion.id,
      signalIds,
      createdAt: now,
    };
    store.conditions.push(condition);
    recordAuditEvent(store, {
      actor: SYSTEM_ACTOR,
      entityType: "condition",
      entityId: condition.id,
      eventType: "condition.created",
      summary: `Condition ${condition.id} created for ${personId} from playbook version ${publishedVersion.id}`,
    });

    const threshold = publishedVersion.rule.threshold;
    const assignmentName =
      assignmentNameFromSignal(overdueSignal) ?? publishedVersion.expectedOutcome.assignment;
    const grade = gradeFromSignal(gradeSignal);
    // Base confidence from the two required signals, nudged up by whatever
    // supporting context (activity/interaction) is also present.
    const confidence = Math.min(0.95, 0.75 + supportingSignals.length * 0.05);

    const rationale =
      `${personId} is overdue on "${assignmentName}"` +
      (grade !== undefined ? ` and scored ${grade}` : "") +
      ` — below the governed threshold of ${threshold} set by playbook rule ${publishedVersion.rule.id}, ` +
      `so this opportunity should be surfaced now.`;

    const opportunity: Opportunity = {
      id: nextSequentialId("OPP", store.opportunities.map((existing) => existing.id)),
      conditionId: condition.id,
      personId,
      courseId: overdueSignal.courseId ?? gradeSignal.courseId,
      status: "open",
      priority: "high",
      recommendedAction: `Reach out to confirm submission of "${assignmentName}" and review current standing against the ${threshold} threshold before it affects the student's progress.`,
      explanation: {
        signalIds,
        conditionId: condition.id,
        playbookVersionId: publishedVersion.id,
        ruleId: publishedVersion.rule.id,
        thresholdUsed: threshold,
        confidence,
        rationale,
        recommendedPosture: "proactive-outreach",
      },
      createdAt: now,
    };
    store.opportunities.push(opportunity);
    recordAuditEvent(store, {
      actor: SYSTEM_ACTOR,
      entityType: "opportunity",
      entityId: opportunity.id,
      eventType: "opportunity.created",
      summary: `Opportunity ${opportunity.id} created for ${personId} (priority: high)`,
    });
  }
}
