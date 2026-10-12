/**
 * Verification Toolbar — the first visible surface for returning the demo to
 * a known-good state. Later stories add more controls to this same
 * component (e.g. the SIG-005 button) rather than inventing new surfaces.
 *
 * Everything here is a native form control (`<input type="datetime-local">`,
 * `<button>`) so the toolbar is keyboard-operable with no extra wiring.
 */

"use client";

import { useState, type FormEvent } from "react";

interface VerificationToolbarProps {
  /** ISO-8601 instant the synthetic clock was at when the page was rendered. */
  initialClock: string;
}

/** `datetime-local` inputs want "YYYY-MM-DDTHH:mm:ss" with no timezone suffix. */
function toDatetimeLocalValue(iso: string): string {
  return iso.slice(0, 19);
}

export default function VerificationToolbar({ initialClock }: VerificationToolbarProps) {
  const [current, setCurrent] = useState(initialClock);
  const [draftInstant, setDraftInstant] = useState(() => toDatetimeLocalValue(initialClock));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleAdvance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsPending(true);
    try {
      const target = new Date(draftInstant);
      if (Number.isNaN(target.getTime())) {
        setMessage("Enter a valid date and time.");
        return;
      }

      const response = await fetch("/api/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instant: target.toISOString() }),
      });
      const data = (await response.json()) as { current?: string; error?: string };

      if (!response.ok) {
        setMessage(data.error ?? "Failed to advance clock.");
        return;
      }

      setCurrent(data.current ?? current);
      setDraftInstant(toDatetimeLocalValue(data.current ?? current));
      setMessage("Clock advanced.");
    } catch {
      setMessage("Failed to advance clock.");
    } finally {
      setIsPending(false);
    }
  }

  async function handleReset() {
    setMessage(null);
    setIsPending(true);
    try {
      const resetResponse = await fetch("/api/admin/reset", { method: "POST" });
      if (!resetResponse.ok) {
        setMessage("Failed to reset demo data.");
        return;
      }

      const clockResponse = await fetch("/api/clock");
      const clockData = (await clockResponse.json()) as { current: string };
      setCurrent(clockData.current);
      setDraftInstant(toDatetimeLocalValue(clockData.current));
      setMessage("Demo data reset.");
    } catch {
      setMessage("Failed to reset demo data.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section aria-labelledby="verification-toolbar-heading">
      <h2 id="verification-toolbar-heading">Verification Toolbar</h2>

      <p>
        Current synthetic time: <time dateTime={current}>{current}</time>
      </p>

      <form onSubmit={handleAdvance}>
        <label htmlFor="verification-toolbar-advance-input">Advance clock to</label>
        <input
          id="verification-toolbar-advance-input"
          name="instant"
          type="datetime-local"
          step="1"
          value={draftInstant}
          onChange={(event) => setDraftInstant(event.target.value)}
          disabled={isPending}
        />
        <button type="submit" disabled={isPending}>
          Advance clock
        </button>
      </form>

      <button type="button" onClick={handleReset} disabled={isPending}>
        Reset demo data
      </button>

      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
