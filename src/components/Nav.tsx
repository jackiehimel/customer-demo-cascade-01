/**
 * Shared navigation shell. Rendered once from `layout.tsx` so every page
 * (Playbooks, Command Center, Audit Log, Dev Toolbar) gets the same role
 * display, role-switch control, and top-level links.
 *
 * The role switch posts to `/api/session/role` (the demo-role cookie
 * documented in `src/server/lib/session.ts` — NOT an auth boundary) and then
 * refreshes the current route so Server Components re-render with the new
 * cookie value.
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DemoRole } from "../server/lib/session.ts";

interface NavProps {
  /** The demo role read from the cookie on the server, or `null` if none is selected yet. */
  currentRole: DemoRole | null;
}

const ROLE_LABELS: Record<DemoRole, string> = {
  administrator: "Administrator",
  advisor: "Advisor",
};

export default function Nav({ currentRole }: NavProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSwitch(event: React.ChangeEvent<HTMLSelectElement>) {
    const role = event.target.value as DemoRole;
    setError(null);
    setIsPending(true);
    try {
      const response = await fetch("/api/session/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) {
        setError("Failed to switch role.");
        return;
      }
      router.refresh();
    } catch {
      setError("Failed to switch role.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <nav aria-label="Primary">
      <p>
        Current role:{" "}
        <strong>{currentRole ? ROLE_LABELS[currentRole] : "None selected"}</strong>
      </p>

      <label htmlFor="nav-role-switch">Switch role</label>
      <select
        id="nav-role-switch"
        value={currentRole ?? ""}
        onChange={handleSwitch}
        disabled={isPending}
      >
        <option value="" disabled>
          Select a role
        </option>
        <option value="administrator">Administrator</option>
        <option value="advisor">Advisor</option>
      </select>
      {error ? <span role="status">{error}</span> : null}

      <ul>
        <li>
          <Link href="/advisor">Command Center</Link>
        </li>
        <li>
          <Link href="/admin/playbooks">Playbooks</Link>
        </li>
        <li>
          <Link href="/audit">Audit Log</Link>
        </li>
        <li>
          <Link href="/dev">Dev Toolbar</Link>
        </li>
      </ul>
    </nav>
  );
}
