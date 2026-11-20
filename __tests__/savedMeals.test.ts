import { cleanMealValues, savedMealToLogInsert, parseAmount } from '../lib/savedMeals'
import type { SavedMeal } from '../lib/types'

const meal: SavedMeal = {
  id: 'meal-1',
  user_id: 'u1',
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
  source: 'photo',
  name: '  Chicken bowl ',
  calories: 612.4,
  protein: 41.26,
  carbs: 55,
  fats: 20.04,
  fiber: 6,
  raw_response: { name: 'Chicken bowl', source: 'claude' },
}

describe('cleanMealValues', () => {
  it('trims the name and rounds values', () => {
    expect(cleanMealValues({ name: ' Oats ', calories: 300.6, protein: 10.04, carbs: 50, fats: 5.55, fiber: 8 })).toEqual({
      name: 'Oats', calories: 301, protein: 10, carbs: 50, fats: 5.6, fiber: 8,
    })
  })

  it('falls back when the name is blank', () => {
    expect(cleanMealValues({ name: '   ', calories: 1, protein: 0, carbs: 0, fats: 0, fiber: 0 }, 'Original').name).toBe('Original')
  })
})

describe('savedMealToLogInsert', () => {
  it('copies values into a food_logs row for the given day', () => {
    expect(savedMealToLogInsert(meal, 'u1', '2026-11-20')).toEqual({
      user_id: 'u1',
      date: '2026-11-20',
      source: 'photo',
      name: 'Chicken bowl',
      calories: 612,
      protein: 41.3,
      carbs: 55,
      fats: 20,
      fiber: 6,
      raw_response: { name: 'Chicken bowl', source: 'claude', saved_meal_id: 'meal-1' },
    })
  })

  it('defaults a missing source and raw_response', () => {
    const row = savedMealToLogInsert({ ...meal, source: null, raw_response: null }, 'u1', '2026-11-20')
    expect(row.source).toBe('text')
    expect(row.raw_response).toEqual({ saved_meal_id: 'meal-1' })
  })
})

describe('parseAmount', () => {
  it('parses numbers, commas and junk', () => {
    expect(parseAmount('12.5')).toBe(12.5)
    expect(parseAmount('12,5')).toBe(12.5)
    expect(parseAmount('')).toBe(0)
    expect(parseAmount('abc')).toBe(0)
  })
})
