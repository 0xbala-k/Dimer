import { localDayBounds } from './date'

const MAX_STORED_AGE_MS = 36 * 3600_000

/**
 * Start of "today" as an ISO timestamp: the live Whoop cycle start, else the
 * latest stored cycle start (if within 36h), else local midnight.
 */
export function currentDayStart(
  live: { cycleStart: string | null } | null,
  latestStoredStart: string | null,
  now: Date = new Date(),
): string {
  if (live?.cycleStart) return live.cycleStart
  if (latestStoredStart && now.getTime() - new Date(latestStoredStart).getTime() <= MAX_STORED_AGE_MS) {
    return latestStoredStart
  }
  return localDayBounds(now).start
}
