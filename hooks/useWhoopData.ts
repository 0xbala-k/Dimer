import { useState, useEffect, useCallback } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import { fetchTodayWhoopData } from '../lib/whoop'
import type { WhoopData } from '../lib/types'

interface State {
  data: WhoopData | null
  loading: boolean
  error: string | null
}

export function useWhoopData() {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null })

  const fetch = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const data = await fetchTodayWhoopData()
      setState({ data, loading: false, error: null })
    } catch (e) {
      setState({ data: null, loading: false, error: String(e) })
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
