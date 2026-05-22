import type { FoodLog, DeficitState, MacroTotals } from '../lib/types'

// Pure function — exported for unit testing
export function computeDeficit(burned: number, logs: FoodLog[]): DeficitState {
  const consumed = logs.reduce((sum, l) => sum + l.calories, 0)
  const deficit = burned - consumed
  const pct = burned === 0 ? 0 : consumed / burned

  const macroTotals: MacroTotals = logs.reduce(
    (acc, l) => ({
      protein: acc.protein + l.protein,
      carbs: acc.carbs + l.carbs,
      fats: acc.fats + l.fats,
      fiber: acc.fiber + l.fiber,
    }),
    { protein: 0, carbs: 0, fats: 0, fiber: 0 }
  )

  return { deficit, pct, isDeficit: deficit >= 0, macroTotals }
}

export function useDeficit(burned: number, logs: FoodLog[]): DeficitState {
  return computeDeficit(burned, logs)
}
