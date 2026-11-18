import { supabase } from './supabase'
import type { FoodResult, RestaurantResult } from './types'

/**
 * Analyzes a meal. Text: `data` is the description. Photo: `data` is one
 * base64 JPEG (the original request shape), or `images` holds 2–4 base64
 * JPEGs of the same meal, analyzed together into one entry.
 */
export async function analyzeFood(params:
  | { mode: 'text'; data: string; description?: string }
  | { mode: 'photo'; data: string; description?: string }
  | { mode: 'photo'; images: string[]; description?: string }
): Promise<FoodResult> {
  const payload = 'images' in params
    ? params.images.length === 1 ? { data: params.images[0] } : { images: params.images }
    : { data: params.data }
  const { data, error } = await supabase.functions.invoke('food-analyze', {
    body: {
      mode: params.mode,
      ...payload,
      ...(params.description ? { description: params.description } : {}),
    },
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
