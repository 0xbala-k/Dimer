import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { supabase } from '../lib/supabase'
import { onCyclesSynced } from '../lib/cycleSync'
import { currentDayStart } from '../lib/currentDay'
import { localDateString } from '../lib/date'
import type { WhoopData } from '../lib/types'

interface WhoopState {
  data: WhoopData | null
  loading: boolean
  error: string | null
}

type Stored = { start: string; day: string } | null

/**
 * Start of the current "day" (the Whoop cycle) and its YYYY-MM-DD label.
 * dayStart is null until Whoop has loaded or failed, so food isn't fetched
 * against a midnight guess that then changes.
 */
export function useTodayStart(whoop: WhoopState): { dayStart: string | null; label: string | null } {
  const [stored, setStored] = useState<Stored>(null)
  const [storedLoaded, setStoredLoaded] = useState(false)

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const readStored = useCallback(() => {
    supabase
      .from('whoop_cycles')
      .select('start,day')
      .order('start', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (!mounted.current) return
        if (error) console.error('[useTodayStart] stored cycle read failed:', error)
        else setStored((data?.[0] as Stored) ?? null)
        setStoredLoaded(true)
      })
  }, [])

  // Reread when Whoop's result changes or errors, when the app returns to the
  // foreground, and after a cycle sync completes.
  useEffect(() => { readStored() }, [readStored, whoop.data, whoop.error])
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') readStored() })
    const off = onCyclesSynced(readStored)
    return () => { sub.remove(); off() }
  }, [readStored])

  const last = useRef<{ dayStart: string; label: string } | null>(null)
  const whoopSettled = !!whoop.data || !!whoop.error || !whoop.loading
  if (!whoopSettled || !storedLoaded) return last.current ?? { dayStart: null, label: null }

  const dayStart = currentDayStart(whoop.data, stored?.start ?? null)
  const label = whoop.data?.day ?? (stored && dayStart === stored.start ? stored.day : null) ?? localDateString()
  last.current = { dayStart, label }
  return last.current
}
