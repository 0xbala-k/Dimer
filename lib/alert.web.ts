/**
 * Web implementation of lib/alert.ts. react-native-web makes Alert.alert a
 * silent no-op, so this maps onto the browser's window.alert/confirm while
 * preserving the button-callback semantics call sites rely on. Guarded for
 * SSR/static export where window is undefined.
 */

export type AlertButton = {
  text: string
  style?: 'default' | 'cancel' | 'destructive'
  onPress?: () => void
}

export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (typeof window === 'undefined') return

  const body = title + (message ? '\n\n' + message : '')

  if (!buttons || buttons.length <= 1) {
    window.alert(body)
    buttons?.[0]?.onPress?.()
    return
  }

  const confirmed = window.confirm(body)
  if (confirmed) {
    const primary = buttons.find((b) => b.style !== 'cancel')
    primary?.onPress?.()
  } else {
    const cancel = buttons.find((b) => b.style === 'cancel')
    cancel?.onPress?.()
  }
}
