/**
 * Native alert wrapper. Delegates to React Native's Alert.alert. The web build
 * (alert.web.ts) reimplements the same API on top of window.alert/confirm.
 */
import { Alert } from 'react-native'

export type AlertButton = {
  text: string
  style?: 'default' | 'cancel' | 'destructive'
  onPress?: () => void
}

export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  Alert.alert(title, message, buttons)
}
