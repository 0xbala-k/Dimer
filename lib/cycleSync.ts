import { supabase } from './supabase'
import { ensureUserRow } from './auth'
import { fetchCyclesPage, getValidAccessToken } from './whoop'
import { toCycleRow, type CycleRecord } from './whoopCycles'
import type { WhoopCycleRow } from './types'

const DAY_MS = 86400_000

/** Where to start fetching: the oldest unfinished stored cycle, else the newest stored one, else recent history. */
export function syncFromIso(
  stored: Pick<WhoopCycleRow, 'start' | 'end' | 'score_state'>[],
  earliestLogIso: string | null,
  now: Date,
): string {
  const t = (iso: string) => new Date(iso).getTime()
  const newestStart = stored.length > 0 ? Math.max(...stored.map((c) => t(c.start))) : -Infinity
  const cutoff = now.getTime() - 7 * DAY_MS
  const unfinished = stored.filter((c) => {
    const s = t(c.start)
    if (s < cutoff) return false
    // An open cycle followed by a newer stored one is stale, not unfinished.
    if (c.end === null) return s >= newestStart
    return c.score_state === 'PENDING_SCORE'
  })
  if (unfinished.length > 0) {
    return new Date(Math.min(...unfinished.map((c) => t(c.start)))).toISOString()
  }
  if (stored.length > 0) {
    return new Date(Math.max(...stored.map((c) => t(c.start)))).toISOString()
  }
  const floor = now.getTime() - 30 * DAY_MS
  const from = earliestLogIso ? Math.max(t(earliestLogIso), floor) : floor
  return new Date(from).toISOString()
}

/** Dedupe by cycle_id, keeping the last occurrence (Postgres rejects a batch that hits one row twice). */
export function dedupeByCycleId<T extends { cycle_id: number }>(rows: T[]): T[] {
  const m = new Map<number, T>()
  for (const r of rows) m.set(r.cycle_id, r)
  return [...m.values()]
}

export async function fetchAllCyclesSince(
  startIso: string,
  fetchPage: typeof fetchCyclesPage,
  maxPages = 40,
): Promise<CycleRecord[]> {
  const out: CycleRecord[] = []
  let token: string | undefined
  for (let i = 0; i < maxPages; i++) {
    const page = await fetchPage(startIso, token)
    out.push(...page.records)
    if (!page.next_token || page.records.length === 0) break
    token = page.next_token
  }
  return out
}

const listeners = new Set<() => void>()

/** Subscribe to successful cycle syncs (fired after the upsert). Returns an unsubscribe. */
export function onCyclesSynced(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

let inFlight: Promise<void> | null = null

async function run(): Promise<void> {
  try {
    if (!(await getValidAccessToken())) return
    const userId = await ensureUserRow()
    const [storedRes, logRes] = await Promise.all([
      supabase.from('whoop_cycles').select('start,end,score_state').eq('user_id', userId)
        .order('start', { ascending: false }).limit(60),
      supabase.from('food_logs').select('logged_at').eq('user_id', userId)
        .order('logged_at', { ascending: true }).limit(1),
    ])
    if (storedRes.error) throw storedRes.error
    if (logRes.error) throw logRes.error
    const from = syncFromIso(storedRes.data ?? [], logRes.data?.[0]?.logged_at ?? null, new Date())
    const records = await fetchAllCyclesSince(from, fetchCyclesPage)
    const rows = dedupeByCycleId(
      records.map((r) => toCycleRow(r, userId)).filter((r): r is WhoopCycleRow => r !== null),
    )
    if (rows.length === 0) return
    const { error } = await supabase.from('whoop_cycles').upsert(rows, { onConflict: 'user_id,cycle_id' })
    if (error) throw error
    listeners.forEach((cb) => cb())
  } catch (e) {
    console.error('[cycleSync] failed:', e)
  }
}

/** Single-flight: concurrent callers share one run. Never throws. */
export function syncCycles(): Promise<void> {
  if (!inFlight) {
    inFlight = run().finally(() => {
      inFlight = null
    })
  }
  return inFlight
}
