import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
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

  useEffect(() => {
    let cancelled = false
    supabase
      .from('whoop_cycles')
      .select('start,day')
      .order('start', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('[useTodayStart] stored cycle read failed:', error)
        else setStored((data?.[0] as Stored) ?? null)
        setStoredLoaded(true)
      })
    return () => { cancelled = true }
  }, [])

  const whoopSettled = !!whoop.data || !!whoop.error || !whoop.loading
  if (!whoopSettled || !storedLoaded) return { dayStart: null, label: null }

  const dayStart = currentDayStart(whoop.data, stored?.start ?? null)
  const label = whoop.data?.day ?? (stored && dayStart === stored.start ? stored.day : null) ?? localDateString()
  return { dayStart, label }
}
