// Mock native deps so scaleByServing (a pure function) can be tested in Node
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TextInput: 'TextInput',
  Pressable: 'Pressable', StyleSheet: { create: (s: unknown) => s }, Alert: { alert: jest.fn() },
}))
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(), NotificationFeedbackType: { Success: 'SUCCESS' },
}))
jest.mock('../lib/supabase', () => ({ supabase: { from: jest.fn() } }))
jest.mock('../lib/auth', () => ({ ensureSession: jest.fn() }))
jest.mock('../lib/theme', () => ({
  colors: {}, fonts: {}, radii: {}, spacing: {},
}))
jest.mock('../components/GlassCard', () => ({ GlassCard: 'GlassCard' }))

import { scaleByServing } from '../components/ConfirmFoodCard'

describe('scaleByServing', () => {
  it('scales macros proportionally', () => {
    const base = { calories: 300, protein: 30, carbs: 40, fats: 10, fiber: 5 }
    const result = scaleByServing(base, 150, 100) // 150g instead of 100g
    expect(result.calories).toBeCloseTo(450)
    expect(result.protein).toBeCloseTo(45)
    expect(result.fiber).toBeCloseTo(7.5)
  })

  it('handles zero originalGrams gracefully', () => {
    const base = { calories: 300, protein: 30, carbs: 40, fats: 10, fiber: 5 }
    const result = scaleByServing(base, 100, 0)
    expect(result.calories).toBe(300) // unchanged
  })
})
