/**
 * Publish control for a single playbook version, rendered by the admin
 * Playbooks page (`src/app/admin/playbooks/page.tsx`) for each row. Posts to
 * `POST /api/playbooks/[id]/publish` (`src/server/domain/playbooks.ts`) and
 * refreshes the current route on success so the Server Component re-renders
 * with the new status (including the newly-superseded sibling, if any).
 */

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Id = string;

interface PublishPlaybookButtonProps {
  /** The playbook version's own id, e.g. "PLAYBOOK-001-V2". */
  versionId: Id;
  /** Disables the button — e.g. the version is already published. */
  disabled?: boolean;
}

interface PublishErrorBody {
  error?: string;
  errors?: Record<string, string>;
}

function describeError(body: PublishErrorBody | null): string {
  if (!body) {
    return "Failed to publish playbook version.";
  }
  if (body.errors) {
    const messages = Object.values(body.errors).filter(Boolean);
    if (messages.length > 0) {
      return messages.join(" ");
    }
  }
  return body.error ?? "Failed to publish playbook version.";
}

export default function PublishPlaybookButton({
  versionId,
  disabled = false,
}: PublishPlaybookButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePublish() {
    setError(null);
    setIsPending(true);
    try {
      const response = await fetch(`/api/playbooks/${versionId}/publish`, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as PublishErrorBody | null;
        setError(describeError(body));
        return;
      }
      router.refresh();
    } catch {
      setError("Failed to publish playbook version.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={handlePublish} disabled={disabled || isPending}>
        Publish
      </button>
      {error ? <p role="status">{error}</p> : null}
    </div>
  );
}
