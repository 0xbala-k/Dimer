import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { syncCycles } from '../lib/cycleSync'
import { localDateString } from '../lib/date'
import { visibleDays } from '../lib/historyFormat'
import { groupIntoDays, periodRange, periodTotal, type Day, type Period } from '../lib/days'
import type { FoodLog, WhoopCycleRow } from '../lib/types'

function parseLocal(ymd: string, endOfDay = false): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return endOfDay ? new Date(y, m - 1, d + 1) : new Date(y, m - 1, d)
}

async function fetchLogs(fromIso: string, toIso: string): Promise<FoodLog[]> {
  const { data, error } = await supabase
    .from('food_logs')
    .select('*')
    .gte('logged_at', fromIso)
    .lt('logged_at', toIso)
    .order('logged_at', { ascending: false })
  if (error) throw new Error(error.message || 'Could not load food log')
  return (data ?? []) as FoodLog[]
}

/** A cycle labeled outside the period can still cover its edge hours, so fetch one day either side. */
function shiftDay(ymd: string, n: number): string {
  const d = parseLocal(ymd)
  return localDateString(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n))
}

async function loadPeriod(period: Period, anchor: Date): Promise<Day[]> {
  const { from, to } = periodRange(period, anchor)
  const { data, error } = await supabase
    .from('whoop_cycles')
    .select('*')
    .gte('day', shiftDay(from, -1))
    .lte('day', shiftDay(to, 1))
    .order('start', { ascending: false })
  if (error) throw new Error(error.message || 'Could not load cycles')
  const cycles = (data ?? []) as WhoopCycleRow[]
  const now = new Date()
  let lo = parseLocal(from).getTime()
  let hi = parseLocal(to, true).getTime()
  // Only cycles that touch the period widen the log window.
  for (const c of cycles) {
    lo = Math.min(lo, new Date(c.start).getTime())
    hi = Math.max(hi, c.end ? new Date(c.end).getTime() : now.getTime())
  }
  const logs = await fetchLogs(new Date(lo).toISOString(), new Date(hi + 1).toISOString())
  return groupIntoDays(cycles, logs, now).filter((d) => d.label >= from && d.label <= to)
}

export function useHistory(period: Period, anchor: Date) {
  const [days, setDays] = useState<Day[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reqId = useRef(0)
  const anchorKey = anchor.getTime()

  const load = useCallback(async () => {
    const id = ++reqId.current
    setLoading(true)
    try {
      const result = await loadPeriod(period, new Date(anchorKey))
      if (id !== reqId.current) return
      setDays(result)
      setError(null)
    } catch (e) {
      if (id !== reqId.current) return
      setError(e instanceof Error ? e.message : 'Could not load history')
    }
    setLoading(false)
  }, [period, anchorKey])

  useEffect(() => {
    setDays([])
    load()
  }, [load])

  const refresh = useCallback(async () => {
    await syncCycles()
    await load()
  }, [load])

  const shown = visibleDays(days)
  return { days: shown, total: periodTotal(shown), loading, error, refresh, reload: load }
}

export function useDay(key: string) {
  const [day, setDay] = useState<Day | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stale = false
    ;(async () => {
      setLoading(true)
      try {
        let cycles: WhoopCycleRow[] = []
        let lo: Date
        let hi: Date
        const fallback = /^d-(\d{4}-\d{2}-\d{2})$/.exec(key)
        if (fallback) {
          lo = parseLocal(fallback[1])
          hi = parseLocal(fallback[1], true)
          const { data, error } = await supabase
            .from('whoop_cycles').select('*')
            .lt('start', hi.toISOString())
            .or(`end.is.null,end.gt.${lo.toISOString()}`)
          if (error) throw new Error(error.message)
          cycles = (data ?? []) as WhoopCycleRow[]
        } else {
          const { data, error } = await supabase
            .from('whoop_cycles').select('*').eq('cycle_id', Number(key)).maybeSingle()
          if (error) throw new Error(error.message)
          if (!data) { if (!stale) { setDay(null); setError(null); setLoading(false) }; return }
          const c = data as WhoopCycleRow
          cycles = [c]
          lo = new Date(c.start)
          hi = c.end ? new Date(c.end) : new Date(Date.now() + 86400_000)
        }
        const logs = await fetchLogs(lo.toISOString(), hi.toISOString())
        const found = groupIntoDays(cycles, logs).find((d) => d.key === key) ?? null
        if (stale) return
        setDay(found)
        setError(null)
      } catch (e) {
        if (stale) return
        setError(e instanceof Error ? e.message : 'Could not load day')
      }
      setLoading(false)
    })()
    return () => { stale = true }
  }, [key])

  return { day, loading, error }
}
