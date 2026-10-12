/**
 * Role-selection landing page. Picking a role sets the demo-role cookie
 * (see `src/server/lib/session.ts` — NOT an auth boundary, purely a demo
 * convenience) and redirects into that role's home screen.
 */

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DemoRole } from "../server/lib/session.ts";

const ROLE_DESTINATIONS: Record<DemoRole, string> = {
  administrator: "/admin/playbooks",
  advisor: "/advisor",
};

export default function Home() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function selectRole(role: DemoRole) {
    setError(null);
    setIsPending(true);
    try {
      const response = await fetch("/api/session/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) {
        setError("Failed to select role.");
        return;
      }
      router.push(ROLE_DESTINATIONS[role]);
    } catch {
      setError("Failed to select role.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <main>
      <h1>Application Starter</h1>
      <p>Choose a role to continue as for this demo session.</p>

      <button type="button" disabled={isPending} onClick={() => selectRole("administrator")}>
        Administrator
      </button>
      <button type="button" disabled={isPending} onClick={() => selectRole("advisor")}>
        Advisor
      </button>

      {error ? <p role="status">{error}</p> : null}
    </main>
  );
}
