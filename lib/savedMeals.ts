import type { FoodLog, SavedMeal } from './types'
import { roundNutrition, type NutritionFields } from './nutrition'

export type MealValues = NutritionFields & { name: string }

/**
 * Cleans user-edited meal values for saving: trims the name (falling back to
 * `fallbackName` when blank) and rounds kcal/macros like the confirm card does.
 */
export function cleanMealValues(values: MealValues, fallbackName = 'Saved meal'): MealValues {
  const rounded = roundNutrition(values)
  return { ...rounded, name: values.name.trim() || fallbackName }
}

/** The food_logs row that logging a saved meal on `date` inserts. */
export function savedMealToLogInsert(meal: SavedMeal, userId: string, date: string) {
  const v = cleanMealValues(meal, meal.name)
  return {
    user_id: userId,
    date,
    source: (meal.source ?? 'text') as FoodLog['source'],
    name: v.name,
    calories: v.calories,
    protein: v.protein,
    carbs: v.carbs,
    fats: v.fats,
    fiber: v.fiber,
    raw_response: { ...(meal.raw_response ?? {}), saved_meal_id: meal.id },
  }
}

/** Parses a numeric text field; blank or junk becomes 0. */
export function parseAmount(text: string): number {
  const n = Number(text.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
