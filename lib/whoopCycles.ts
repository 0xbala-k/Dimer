import type { WhoopCycleRow, WhoopData } from './types'
import { dayLabel } from './days'

export type CycleRecord = {
  id?: number
  timezone_offset?: string
  score_state?: string
  start?: string
  end?: string | null
  score?: { kilojoule?: number; strain?: number }
}

/**
 * Whoop's cycle collection matches any cycle that *overlaps* the queried day,
 * so yesterday's completed cycle (which runs into last night's sleep) comes
 * back alongside today's. Only the ongoing cycle (end == null) is "today";
 * records are sorted by start descending, so the newest is the fallback.
 */
export function summarizeCycles(records: CycleRecord[]): WhoopData {
  const current = records.find((c) => c.end == null) ?? records[0]
  const kj = current?.score?.kilojoule ?? 0
  return {
    cycleStart: current?.start ?? null,
    day: current?.start ? dayLabel(current.start, current.timezone_offset ?? null) : null,
    burned: Math.round(kj / 4.184),
    strain: current?.score?.strain ?? null,
    recovery: null,
  }
}

export function toCycleRow(rec: CycleRecord, userId: string): WhoopCycleRow | null {
  if (rec.id == null || !rec.start) return null
  const tz = rec.timezone_offset ?? null
  const kj = rec.score?.kilojoule
  return {
    user_id: userId,
    cycle_id: rec.id,
    start: rec.start,
    end: rec.end ?? null,
    tz_offset: tz,
    day: dayLabel(rec.start, tz),
    score_state: (rec.score_state as WhoopCycleRow['score_state']) ?? 'PENDING_SCORE',
    burned: typeof kj === 'number' ? Math.round(kj / 4.184) : null,
    strain: rec.score?.strain ?? null,
  }
}
