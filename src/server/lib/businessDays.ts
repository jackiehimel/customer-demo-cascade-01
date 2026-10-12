/**
 * Business-day arithmetic.
 *
 * "Business day" here means Monday–Friday — there is intentionally **no**
 * holiday calendar, only weekends (Saturday/Sunday) are skipped. This backs
 * the outcome engine's "N business days after the recommended action" due
 * date calculation.
 *
 * All arithmetic is done in UTC so the result doesn't depend on the host
 * machine's local timezone, matching the UTC `IsoDateTime` strings produced
 * by the synthetic clock.
 */

function isWeekendUtc(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 /* Sunday */ || day === 6 /* Saturday */;
}

/**
 * Returns a new `Date` that is `n` business days after `date`, skipping
 * Saturdays and Sundays. `date` is never mutated.
 *
 * @param date Starting point (not itself counted).
 * @param n Non-negative integer number of business days to advance by.
 */
export function addBusinessDays(date: Date, n: number): Date {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`addBusinessDays: n must be a non-negative integer, got ${n}`);
  }

  const result = new Date(date.getTime());
  let remaining = n;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    if (!isWeekendUtc(result)) {
      remaining -= 1;
    }
  }
  return result;
}
