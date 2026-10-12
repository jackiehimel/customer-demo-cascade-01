/**
 * `/audit` — the audit log viewer, linked from `Nav` as "Audit Log". Renders
 * every `AuditEvent` recorded via `recordAuditEvent`
 * (`src/server/lib/audit.ts`), newest first, so evaluators can inspect what
 * happened during the demo journey without hitting `/api/audit` directly.
 */

import { loadStore } from "../../server/store/db.ts";

export default function AuditPage() {
  const store = loadStore();
  const events = [...store.auditEvents].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );

  return (
    <main>
      <h1>Audit Log</h1>

      {events.length === 0 ? (
        <p>No audit events have been recorded yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Entity Type</th>
              <th>Entity Id</th>
              <th>Event Type</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>{event.at}</td>
                <td>{event.actor}</td>
                <td>{event.entityType}</td>
                <td>{event.entityId}</td>
                <td>{event.eventType}</td>
                <td>{event.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
