import { computeDeficit } from '../hooks/useDeficit'
import type { FoodLog } from '../lib/types'

const makeLogs = (overrides: Partial<FoodLog>[]): FoodLog[] =>
  overrides.map((o, i) => ({
    id: String(i),
    user_id: 'u1',
    logged_at: new Date().toISOString(),
    date: '2026-04-18',
    source: 'text' as const,
    name: 'food',
    calories: 0,
    protein: 0,
    carbs: 0,
    fats: 0,
    fiber: 0,
    ...o,
  }))

describe('computeDeficit', () => {
  it('returns deficit when consumed < burned', () => {
    const logs = makeLogs([{ calories: 500, protein: 30, carbs: 50, fats: 10, fiber: 5 }])
    const result = computeDeficit(1000, logs)
    expect(result.deficit).toBe(500)
    expect(result.isDeficit).toBe(true)
    expect(result.pct).toBeCloseTo(0.5)
    expect(result.macroTotals.protein).toBe(30)
    expect(result.macroTotals.fiber).toBe(5)
  })

  it('returns surplus when consumed > burned', () => {
    const logs = makeLogs([{ calories: 1500 }])
    const result = computeDeficit(1000, logs)
    expect(result.deficit).toBe(-500)
    expect(result.isDeficit).toBe(false)
    expect(result.pct).toBeCloseTo(1.5)
  })

  it('handles zero burned gracefully', () => {
    const result = computeDeficit(0, [])
    expect(result.pct).toBe(0)
    expect(result.deficit).toBe(0)
  })

  it('sums macros across multiple logs', () => {
    const logs = makeLogs([
      { protein: 20, carbs: 30, fats: 5, fiber: 2, calories: 200 },
      { protein: 10, carbs: 15, fats: 3, fiber: 1, calories: 100 },
    ])
    const result = computeDeficit(2000, logs)
    expect(result.macroTotals.protein).toBe(30)
    expect(result.macroTotals.carbs).toBe(45)
    expect(result.macroTotals.fats).toBe(8)
    expect(result.macroTotals.fiber).toBe(3)
  })
})
