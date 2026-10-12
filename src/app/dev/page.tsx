/**
 * `/dev` — the Verification Toolbar's home. Linked from `Nav` as "Dev
 * Toolbar" so evaluators can reset demo data and drive the synthetic clock
 * without touching the API directly.
 */

import VerificationToolbar from "../../components/VerificationToolbar.tsx";
import { getCurrentTime } from "../../server/lib/clock.ts";

export default function DevPage() {
  const current = getCurrentTime().toISOString();

  return (
    <main>
      <h1>Dev Tools</h1>
      <VerificationToolbar initialClock={current} />
    </main>
  );
}
