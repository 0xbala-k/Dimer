import { roundNutrition, round1 } from '../lib/nutrition'
import { saveErrorMessage } from '../lib/saveError'

describe('roundNutrition', () => {
  it('rounds kcal to a whole number and macros to one decimal', () => {
    // Red Bull Sugarfree per 100 ml, as Open Food Facts returns it.
    expect(roundNutrition({ calories: 10.4, protein: 0, carbs: 0.8050965834116, fats: 0.04, fiber: 0.15 })).toEqual({
      calories: 10,
      protein: 0,
      carbs: 0.8,
      fats: 0,
      fiber: 0.2,
    })
  })

  it('keeps other fields', () => {
    expect(roundNutrition({ name: 'x', calories: 1, protein: 1, carbs: 1, fats: 1, fiber: 1 }).name).toBe('x')
  })

  it('turns NaN, Infinity and negatives into 0', () => {
    expect(roundNutrition({ calories: NaN, protein: Infinity, carbs: -1, fats: -0.04, fiber: NaN })).toEqual({
      calories: 0,
      protein: 0,
      carbs: 0,
      fats: 0,
      fiber: 0,
    })
  })

  it('round1 rounds half up', () => {
    expect(round1(2.25)).toBe(2.3)
    expect(round1(12.34)).toBe(12.3)
  })
})

describe('saveErrorMessage', () => {
  it('explains a missing users row (foreign key violation)', () => {
    expect(saveErrorMessage({ code: '23503', message: 'insert or update on table "food_logs" violates foreign key constraint' })).toMatch(
      /account isn't set up/
    )
  })

  it('explains an RLS rejection', () => {
    expect(saveErrorMessage({ code: '42501', message: 'new row violates row-level security policy' })).toMatch(/not allowed/)
  })

  it('explains an invalid number', () => {
    expect(saveErrorMessage({ code: '22P02', message: 'invalid input syntax for type integer: "0.8"' })).toMatch(/numbers isn't valid/)
  })

  it('explains an expired session', () => {
    expect(saveErrorMessage({ code: 'PGRST301', message: 'JWT expired' })).toMatch(/session expired/)
  })

  it('only blames the connection for real network failures', () => {
    expect(saveErrorMessage(new TypeError('Load failed'))).toMatch(/Check your connection/)
    expect(saveErrorMessage({ code: '', message: 'TypeError: Failed to fetch' })).toMatch(/Check your connection/)
    expect(saveErrorMessage({ code: '23503', message: 'fk' })).not.toMatch(/connection/)
  })

  it('falls back to a short message with the code', () => {
    expect(saveErrorMessage({ code: 'XX000', message: 'internal' })).toBe('Something went wrong (XX000). Please try again.')
    expect(saveErrorMessage(null)).toBe('Something went wrong. Please try again.')
  })
})
