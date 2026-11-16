import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { FoodLog } from '../lib/types'
let channelCounter = 0

export function useFoodLog(dayStart: string | null) {
  const [logs, setLogs] = useState<FoodLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const channelName = useRef(`food_logs_today_${++channelCounter}`).current

  const fetchLogs = useCallback(async () => {
    if (!dayStart) return
    setLoading(true)
    const { data, error } = await supabase
      .from('food_logs')
      .select('*')
      .gte('logged_at', dayStart)
      .order('logged_at', { ascending: false })
    if (error) {
      console.error('[useFoodLog] fetch failed:', error)
      setError(error.message || 'Could not load your food log')
    } else {
      setError(null)
      if (data) setLogs(data as FoodLog[])
    }
    setLoading(false)
  }, [dayStart])

  // Fetch on mount and whenever the day boundary changes
  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // Realtime subscription — stable, uses ref to avoid re-subscribing
  const fetchRef = useRef(fetchLogs)
  fetchRef.current = fetchLogs

  useEffect(() => {
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'food_logs',
      }, () => { fetchRef.current() })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [channelName])

  const totalCalories = logs.reduce((sum, l) => sum + l.calories, 0)

  async function deleteLog(id: string) {
    setLogs(prev => prev.filter(l => l.id !== id))
    await supabase.from('food_logs').delete().eq('id', id)
  }

  return { logs, loading, error, totalCalories, refetch: fetchLogs, deleteLog }
}
