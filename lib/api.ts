import { supabase } from './supabase'
import type { FoodResult, RestaurantResult } from './types'

export async function analyzeFood(params: {
  mode: 'photo' | 'text' | 'barcode'
  data: string
}): Promise<FoodResult> {
  const { data, error } = await supabase.functions.invoke('food-analyze', {
    body: { mode: params.mode, data: params.data },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as FoodResult
}

export async function searchRestaurant(query: string): Promise<RestaurantResult[]> {
  const { data, error } = await supabase.functions.invoke('restaurant-search', {
    body: { query },
  })
  if (error) throw error
  if (data?.error === 'quota_exceeded') throw new Error('quota_exceeded')
  return (data?.results ?? []) as RestaurantResult[]
}

export async function getRestaurantItem(id: number): Promise<FoodResult> {
  const { data, error } = await supabase.functions.invoke('restaurant-search', {
    body: { id },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return {
    ...data,
    ingredients: [],
    source: 'spoonacular' as const,
  } as FoodResult
}
