import type { WhoopData } from './types'

export type CycleRecord = {
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
    burned: Math.round(kj / 4.184),
    strain: current?.score?.strain ?? null,
    recovery: null,
  }
}
