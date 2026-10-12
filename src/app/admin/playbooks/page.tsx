/**
 * `/admin/playbooks` — lets an Administrator view every playbook version and
 * trigger publication via `PublishPlaybookButton`
 * (`src/components/PublishPlaybookButton.tsx`), which posts to
 * `POST /api/playbooks/[id]/publish`.
 */

import PublishPlaybookButton from "../../../components/PublishPlaybookButton.tsx";
import { loadStore } from "../../../server/store/db.ts";

export default function AdminPlaybooksPage() {
  const store = loadStore();
  const versions = [...store.playbookVersions].sort((a, b) => {
    if (a.playbookId !== b.playbookId) {
      return a.playbookId.localeCompare(b.playbookId);
    }
    return a.version - b.version;
  });

  return (
    <main>
      <h1>Playbooks</h1>

      {versions.length === 0 ? (
        <p>No playbook versions exist yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Playbook</th>
              <th>Version</th>
              <th>Status</th>
              <th>Threshold</th>
              <th>Expected assignment</th>
              <th>Published at</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((version) => (
              <tr key={version.id}>
                <td>{version.playbookId}</td>
                <td>{version.version}</td>
                <td>{version.status}</td>
                <td>{version.rule.threshold}</td>
                <td>{version.expectedOutcome.assignment || "—"}</td>
                <td>{version.publishedAt ?? "—"}</td>
                <td>
                  <PublishPlaybookButton
                    versionId={version.id}
                    disabled={version.status === "published"}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
