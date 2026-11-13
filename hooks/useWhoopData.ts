import { useState, useEffect, useCallback } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import { fetchTodayWhoopData, WhoopAuthError } from '../lib/whoop'
import type { WhoopData } from '../lib/types'

interface State {
  data: WhoopData | null
  loading: boolean
  error: string | null
  /** True when Whoop rejected our tokens and the user needs to reconnect. */
  needsReconnect: boolean
}

export function useWhoopData() {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null, needsReconnect: false })

  const fetch = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const data = await fetchTodayWhoopData()
      setState({ data, loading: false, error: null, needsReconnect: false })
    } catch (e) {
      console.error('[useWhoopData] fetch failed:', e)
      setState({
        data: null,
        loading: false,
        error: e instanceof Error ? e.message : String(e),
        needsReconnect: e instanceof WhoopAuthError,
      })
    }
  }, [])

  useEffect(() => {
    fetch()
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') fetch()
    })
    return () => sub.remove()
  }, [fetch])

  return { ...state, refetch: fetch }
}
