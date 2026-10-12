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
