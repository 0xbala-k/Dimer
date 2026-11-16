import { localDateString } from './date'
import type { FoodLog, MacroTotals, WhoopCycleRow } from './types'

export type DayStatus = 'under' | 'over' | 'not_logged' | 'no_whoop' | 'in_progress'

export interface Day {
  key: string
  label: string
  start: string
  end: string | null
  cycle: WhoopCycleRow | null
  burned: number | null
  eaten: number
  net: number | null
  macros: MacroTotals
  logs: FoodLog[]
  inProgress: boolean
  status: DayStatus
}

export type Period = 'week' | 'month'

const HOUR_MS = 3600_000

function offsetMinutes(tz: string | null, start: string): number {
  const m = tz ? /^([+-])(\d{2}):?(\d{2})$/.exec(tz) : null
  if (!m) return -new Date(start).getTimezoneOffset()
  const mins = Number(m[2]) * 60 + Number(m[3])
  return m[1] === '-' ? -mins : mins
}

/** Calendar date (YYYY-MM-DD) of the cycle's midpoint-ish (start + 12h) in the cycle's own offset. */
export function dayLabel(startIso: string, tzOffset: string | null): string {
  const ms = new Date(startIso).getTime() + 12 * HOUR_MS + offsetMinutes(tzOffset, startIso) * 60_000
  return new Date(ms).toISOString().slice(0, 10)
}

function sumLogs(logs: FoodLog[]): { eaten: number; macros: MacroTotals } {
  const macros: MacroTotals = { protein: 0, carbs: 0, fats: 0, fiber: 0 }
  let eaten = 0
  for (const l of logs) {
    eaten += l.calories
    macros.protein += l.protein
    macros.carbs += l.carbs
    macros.fats += l.fats
    macros.fiber += l.fiber
  }
  return { eaten, macros }
}

/**
 * Groups food logs into Whoop-cycle days, newest first. Cycle windows are
 * half-open [start, end); an open cycle extends indefinitely. Logs outside
 * every cycle form fallback days keyed by local date.
 */
export function groupIntoDays(cycles: WhoopCycleRow[], logs: FoodLog[], _now: Date = new Date()): Day[] {
  const sorted = [...cycles].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  const windows = sorted.map((c, i) => {
    const next = sorted[i + 1]
    const nextStart = next ? new Date(next.start).getTime() : Infinity
    const end = c.end ? new Date(c.end).getTime() : Infinity
    return {
      c,
      from: new Date(c.start).getTime(),
      // An open cycle ends where the next one starts (it is stale if one exists).
      to: c.end ? end : nextStart,
      // Only the latest cycle can be in progress.
      open: c.end === null && !next,
      logs: [] as FoodLog[],
    }
  })
  const orphans = new Map<string, FoodLog[]>()
  for (const l of logs) {
    const t = new Date(l.logged_at).getTime()
    const w = windows.find((x) => t >= x.from && t < x.to)
    if (w) w.logs.push(l)
    else {
      const k = localDateString(new Date(l.logged_at))
      orphans.set(k, [...(orphans.get(k) ?? []), l])
    }
  }

  const days: Day[] = windows.map(({ c, open, logs: dl }) => {
    const { eaten, macros } = sumLogs(dl)
    let net: number | null = null
    let status: DayStatus
    if (open) {
      status = 'in_progress'
      if (dl.length > 0 && c.burned !== null) net = c.burned - eaten
    } else if (c.burned === null) {
      status = 'no_whoop'
    } else if (dl.length === 0) {
      status = 'not_logged'
    } else {
      net = c.burned - eaten
      status = net >= 0 ? 'under' : 'over'
    }
    return {
      key: String(c.cycle_id), label: dayLabel(c.start, c.tz_offset), start: c.start, end: c.end,
      cycle: c, burned: c.burned, eaten, net, macros, logs: dl, inProgress: open, status,
    }
  })

  for (const [label, dl] of orphans) {
    const [y, m, d] = label.split('-').map(Number)
    const { eaten, macros } = sumLogs(dl)
    days.push({
      key: `d-${label}`, label,
      start: new Date(y, m - 1, d).toISOString(), end: new Date(y, m - 1, d + 1).toISOString(),
      cycle: null, burned: null, eaten, net: null, macros, logs: dl, inProgress: false, status: 'no_whoop',
    })
  }

  return days.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
}

/** Inclusive local-calendar range; weeks start Monday. */
export function periodRange(period: Period, anchor: Date): { from: string; to: string } {
  const y = anchor.getFullYear()
  const m = anchor.getMonth()
  const d = anchor.getDate()
  if (period === 'month') {
    return { from: localDateString(new Date(y, m, 1)), to: localDateString(new Date(y, m + 1, 0)) }
  }
  const sinceMonday = (anchor.getDay() + 6) % 7
  return {
    from: localDateString(new Date(y, m, d - sinceMonday)),
    to: localDateString(new Date(y, m, d - sinceMonday + 6)),
  }
}

export function shiftAnchor(period: Period, anchor: Date, dir: -1 | 1): Date {
  const y = anchor.getFullYear()
  const m = anchor.getMonth()
  const d = anchor.getDate()
  if (period === 'week') return new Date(y, m, d + 7 * dir)
  const last = new Date(y, m + dir + 1, 0).getDate()
  return new Date(y, m + dir, Math.min(d, last))
}

export function periodTotal(days: Day[]): { net: number; logged: number; total: number } {
  let net = 0
  let logged = 0
  for (const d of days) {
    if (d.net === null) continue
    if (d.status === 'under' || d.status === 'over' || d.status === 'in_progress') {
      net += d.net
      logged++
    }
  }
  return { net, logged, total: days.length }
}
