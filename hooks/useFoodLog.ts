import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { FoodLog } from '../lib/types'

function todayDate() {
  return new Date().toISOString().split('T')[0]
}

export function useFoodLog() {
  const [logs, setLogs] = useState<FoodLog[]>([])
  const [loading, setLoading] = useState(true)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('food_logs')
      .select('*')
      .eq('date', todayDate())
      .order('logged_at', { ascending: false })
    if (!error && data) setLogs(data as FoodLog[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchLogs()

    const channel = supabase
      .channel('food_logs_today')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'food_logs',
        filter: `date=eq.${todayDate()}`,
      }, () => {
        fetchLogs()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchLogs])

  const totalCalories = logs.reduce((sum, l) => sum + l.calories, 0)

  async function deleteLog(id: string) {
    setLogs(prev => prev.filter(l => l.id !== id))
    await supabase.from('food_logs').delete().eq('id', id)
  }

  return { logs, loading, totalCalories, refetch: fetchLogs, deleteLog }
}
