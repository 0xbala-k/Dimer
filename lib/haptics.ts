/**
 * Native haptics wrapper. Passes through to expo-haptics as fire-and-forget
 * calls so call sites never touch the async API directly. The web build
 * (haptics.web.ts) provides the same shape without importing expo-haptics.
 */
import * as Haptics from 'expo-haptics'

export const haptics = {
  selection(): void {
    Haptics.selectionAsync().catch(() => {})
  },
  impact(style?: Haptics.ImpactFeedbackStyle): void {
    Haptics.impactAsync(style).catch(() => {})
  },
  notification(type?: Haptics.NotificationFeedbackType): void {
    Haptics.notificationAsync(type).catch(() => {})
  },
}

export { ImpactFeedbackStyle, NotificationFeedbackType } from 'expo-haptics'
