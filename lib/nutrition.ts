import type { FoodResult } from './types'

export type NutritionFields = Pick<FoodResult, 'calories' | 'protein' | 'carbs' | 'fats' | 'fiber'>

/** Rounds to one decimal place; anything that isn't a finite number becomes 0. */
export function round1(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0
}

/**
 * Rounds nutrition values for display and saving: kcal to a whole number,
 * macros to one decimal. Open Food Facts returns values like 0.8050965834116 g.
 * Non-finite values (NaN, Infinity) become 0, and negatives are clamped to 0.
 */
export function roundNutrition<T extends NutritionFields>(n: T): T {
  const clamp = (x: number) => Math.max(0, x)
  return {
    ...n,
    calories: clamp(Number.isFinite(n.calories) ? Math.round(n.calories) : 0),
    protein: clamp(round1(n.protein)),
    carbs: clamp(round1(n.carbs)),
    fats: clamp(round1(n.fats)),
    fiber: clamp(round1(n.fiber)),
  }
}
