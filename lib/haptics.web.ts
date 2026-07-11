/**
 * Web implementation of lib/haptics.ts. expo-haptics is native-only, so this
 * module is self-contained: it defines locally-compatible enum stand-ins and
 * degrades to the Vibration API when available (guarded for SSR/static export).
 */

// Plain const objects mirroring expo-haptics enum values so call sites that
// reference ImpactFeedbackStyle.Medium / NotificationFeedbackType.Success stay
// type-compatible without importing the native module.
export const ImpactFeedbackStyle = {
  Light: 'light',
  Medium: 'medium',
  Heavy: 'heavy',
  Soft: 'soft',
  Rigid: 'rigid',
} as const
export type ImpactFeedbackStyle = (typeof ImpactFeedbackStyle)[keyof typeof ImpactFeedbackStyle]

export const NotificationFeedbackType = {
  Success: 'success',
  Warning: 'warning',
  Error: 'error',
} as const
export type NotificationFeedbackType = (typeof NotificationFeedbackType)[keyof typeof NotificationFeedbackType]

function buzz(): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(10)
  }
}

export const haptics = {
  selection(): void {
    buzz()
  },
  impact(_style?: ImpactFeedbackStyle): void {
    buzz()
  },
  notification(_type?: NotificationFeedbackType): void {
    buzz()
  },
}
