/**
 * Draft panel — renders the deterministic communication draft for an
 * opportunity, fetched-or-created via `getOrCreateDraft`
 * (`src/server/lib/communication.ts`), the same domain function backing `GET
 * /api/opportunities/[id]/draft`. Rendered by the opportunity detail page
 * (`src/app/advisor/opportunities/[id]/page.tsx`), alongside `WhyPanel`.
 *
 * Client Component: owns the edit/confirm-review/send controls that drive
 * the draft's human-review-gated state machine —
 * `PATCH /api/drafts/[id]` (edit), `POST /api/drafts/[id]/confirm-review`
 * (confirm), and `POST /api/drafts/[id]/send` (send) — all backed by
 * `src/server/lib/communication.ts`. A blocked send (review not yet
 * confirmed, or already sent) renders its error with `role="alert"` so
 * assistive tech announces it immediately; other action errors use the same
 * treatment for consistency.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CommunicationDraft } from "../server/store/types.ts";

interface DraftPanelProps {
  draft: CommunicationDraft;
}

interface DraftErrorBody {
  error?: string;
}

interface DraftResponseBody {
  draft: CommunicationDraft;
}

async function describeError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as DraftErrorBody | null;
  return body?.error ?? fallback;
}

export default function DraftPanel({ draft: initialDraft }: DraftPanelProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [draftText, setDraftText] = useState(initialDraft.content);
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSent = Boolean(draft.sentAt);

  async function handleSaveEdit() {
    setError(null);
    setIsPending(true);
    try {
      const response = await fetch(`/api/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draftText }),
      });
      if (!response.ok) {
        setError(await describeError(response, "Failed to save draft edit."));
        return;
      }
      const body = (await response.json()) as DraftResponseBody;
      setDraft(body.draft);
      setDraftText(body.draft.content);
      setIsEditing(false);
      router.refresh();
    } catch {
      setError("Failed to save draft edit.");
    } finally {
      setIsPending(false);
    }
  }

  function handleCancelEdit() {
    setDraftText(draft.content);
    setIsEditing(false);
    setError(null);
  }

  async function handleConfirmReview() {
    setError(null);
    setIsPending(true);
    try {
      const response = await fetch(`/api/drafts/${draft.id}/confirm-review`, { method: "POST" });
      if (!response.ok) {
        setError(await describeError(response, "Failed to confirm review."));
        return;
      }
      const body = (await response.json()) as DraftResponseBody;
      setDraft(body.draft);
      router.refresh();
    } catch {
      setError("Failed to confirm review.");
    } finally {
      setIsPending(false);
    }
  }

  async function handleSend() {
    setError(null);
    setIsPending(true);
    try {
      const response = await fetch(`/api/drafts/${draft.id}/send`, { method: "POST" });
      if (!response.ok) {
        setError(await describeError(response, "Failed to send draft."));
        return;
      }
      const body = (await response.json()) as DraftResponseBody;
      setDraft(body.draft);
      router.refresh();
    } catch {
      setError("Failed to send draft.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section aria-labelledby="draft-panel-heading">
      <h2 id="draft-panel-heading">Communication draft</h2>

      <dl>
        <dt>Draft</dt>
        <dd>{draft.id}</dd>
        <dt>Review status</dt>
        <dd>
          {draft.reviewConfirmed && draft.content === draftText ? (
            "Reviewed"
          ) : (
            <span role="status">Awaiting review</span>
          )}
        </dd>
        <dt>Send status</dt>
        <dd>{isSent ? `Sent at ${draft.sentAt}` : <span role="status">Not sent</span>}</dd>
      </dl>

      {isEditing ? (
        <div>
          <label htmlFor="draft-content-editor">Draft content</label>
          <textarea
            id="draft-content-editor"
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            disabled={isPending}
          />
          <div>
            <button type="button" onClick={handleSaveEdit} disabled={isPending}>
              Save edit
            </button>
            <button type="button" onClick={handleCancelEdit} disabled={isPending}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <pre>{draft.content}</pre>
          <button type="button" onClick={() => setIsEditing(true)} disabled={isPending || isSent}>
            Edit
          </button>
        </>
      )}

      <div>
        <button
          type="button"
          onClick={handleConfirmReview}
          disabled={isPending || isSent || draft.reviewConfirmed}
        >
          Confirm review
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={isPending || isSent || !draft.reviewConfirmed || draft.content !== draftText}
        >
          Send
        </button>
      </div>

      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
