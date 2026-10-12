/**
 * `POST /api/admin/reset` — rewrites `store.json` back to the exact seed
 * snapshot produced by `createSeedStore()`, regardless of how much the store
 * has drifted (signals added, clock advanced, etc.). This is the mechanism
 * every later test/demo run starts from, so it must be idempotent: resetting
 * twice in a row (with or without mutations in between) always produces the
 * same observable state.
 */

// The explicit ".js" extension (vs. the bare "next/server") lets this route's
// `__tests__` import it directly under `node --test`, which — unlike Next's
// own bundler — needs a fully-resolvable specifier since the "next" package
// has no "exports" map entry for the bare "next/server" subpath.
import { NextResponse } from "next/server.js";
import { saveStore, withStoreLock } from "../../../../server/store/db.ts";
import { createSeedStore } from "../../../../server/store/seed.ts";

export async function POST() {
  await withStoreLock(() => {
    saveStore(createSeedStore());
  });

  return NextResponse.json({ status: "ok" });
}
