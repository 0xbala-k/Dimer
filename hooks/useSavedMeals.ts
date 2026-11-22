import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { ensureUserRow } from '../lib/auth'
import { localDateString } from '../lib/date'
import { cleanMealValues, savedMealToLogInsert, type MealValues } from '../lib/savedMeals'
import type { FoodLog, SavedMeal } from '../lib/types'

/** The user's saved meals, with save / edit / delete / log-now actions. */
export function useSavedMeals() {
  const [meals, setMeals] = useState<SavedMeal[]>([])
  const [loading, setLoading] = useState(false)

  const refetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('saved_meals')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error('[useSavedMeals] fetch failed:', error)
    else if (data) setMeals(data as SavedMeal[])
    setLoading(false)
  }, [])

  const saveMeal = useCallback(async (
    values: MealValues,
    source: FoodLog['source'],
    raw: Record<string, unknown> | null,
  ) => {
    const userId = await ensureUserRow()
    const v = cleanMealValues(values)
    const { data, error } = await supabase
      .from('saved_meals')
      .insert({ user_id: userId, source, raw_response: raw, ...v })
      .select()
      .single()
    if (error) throw error
    setMeals(prev => [data as SavedMeal, ...prev])
  }, [])

  const updateMeal = useCallback(async (id: string, values: MealValues) => {
    const v = cleanMealValues(values)
    const { data, error } = await supabase
      .from('saved_meals')
      .update({ ...v, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    setMeals(prev => prev.map(m => (m.id === id ? (data as SavedMeal) : m)))
  }, [])

  const deleteMeal = useCallback(async (id: string) => {
    const { error } = await supabase.from('saved_meals').delete().eq('id', id)
    if (error) throw error
    setMeals(prev => prev.filter(m => m.id !== id))
  }, [])

  /** Logs the saved meal as a new food_logs entry for the current day. */
  const logMeal = useCallback(async (meal: SavedMeal) => {
    const userId = await ensureUserRow()
    const { error } = await supabase
      .from('food_logs')
      .insert(savedMealToLogInsert(meal, userId, localDateString()))
    if (error) throw error
  }, [])

  return { meals, loading, refetch, saveMeal, updateMeal, deleteMeal, logMeal }
}
