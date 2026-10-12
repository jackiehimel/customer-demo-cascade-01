/**
 * `GET /api/audit` — the documented FUN-014 inspection interface onto the
 * append-only audit log built up by `recordAuditEvent`
 * (`src/server/lib/audit.ts`). Supports optional `entityId` and/or
 * `entityType` query-string filters so evaluators (or the `/audit` viewer
 * page) can narrow down to a single entity's history.
 */

// The explicit ".js" extension (vs. the bare "next/server") lets this route's
// `__tests__` import it directly under `node --test`, which — unlike Next's
// own bundler — needs a fully-resolvable specifier since the "next" package
// has no "exports" map entry for the bare "next/server" subpath.
import { NextResponse } from "next/server.js";
import { loadStore } from "../../../server/store/db.ts";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const entityId = searchParams.get("entityId");
  const entityType = searchParams.get("entityType");

  const store = loadStore();
  const events = store.auditEvents.filter((event) => {
    if (entityId && event.entityId !== entityId) {
      return false;
    }
    if (entityType && event.entityType !== entityType) {
      return false;
    }
    return true;
  });

  return NextResponse.json({ events });
}
