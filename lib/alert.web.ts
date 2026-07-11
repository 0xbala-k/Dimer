/**
 * Web implementation of lib/alert.ts. react-native-web makes Alert.alert a
 * silent no-op, and window.confirm can't represent native alert semantics
 * (Enter would default to the destructive action, third buttons would be
 * unreachable, dismissing would drop callbacks), so this renders a small
 * DOM dialog instead. Guarded for SSR/static export where document is
 * undefined.
 */
import { colors } from './theme'

export type AlertButton = {
  text: string
  style?: 'default' | 'cancel' | 'destructive'
  onPress?: () => void
}

export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (typeof document === 'undefined') return

  const resolved: AlertButton[] = buttons?.length ? buttons : [{ text: 'OK' }]
  const cancelButton = resolved.find((b) => b.style === 'cancel')

  const overlay = document.createElement('div')
  overlay.setAttribute('role', 'alertdialog')
  overlay.setAttribute('aria-label', title)
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '9999',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: 'rgba(7,11,20,0.75)',
  } as CSSStyleDeclaration)

  const box = document.createElement('div')
  Object.assign(box.style, {
    background: colors.sheet,
    border: `1px solid ${colors.sheetBorder}`,
    borderRadius: '16px',
    padding: '20px',
    maxWidth: '320px',
    width: '100%',
    fontFamily: 'DMSans_400Regular, system-ui, sans-serif',
  } as CSSStyleDeclaration)

  const heading = document.createElement('div')
  heading.textContent = title
  Object.assign(heading.style, {
    color: colors.text,
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: message ? '8px' : '16px',
  } as CSSStyleDeclaration)
  box.appendChild(heading)

  if (message) {
    const body = document.createElement('div')
    body.textContent = message
    Object.assign(body.style, {
      color: colors.textMuted,
      fontSize: '14px',
      lineHeight: '1.5',
      marginBottom: '16px',
    } as CSSStyleDeclaration)
    box.appendChild(body)
  }

  const row = document.createElement('div')
  Object.assign(row.style, {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  } as CSSStyleDeclaration)

  function close(button?: AlertButton) {
    document.removeEventListener('keydown', onKeyDown, true)
    overlay.remove()
    button?.onPress?.()
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      // Esc = dismiss: run the cancel handler if there is one, like tapping
      // outside a native alert.
      close(cancelButton)
    }
  }

  let focusTarget: HTMLButtonElement | null = null
  for (const button of resolved) {
    const el = document.createElement('button')
    el.type = 'button'
    el.textContent = button.text
    const destructive = button.style === 'destructive'
    const cancel = button.style === 'cancel'
    Object.assign(el.style, {
      padding: '10px 16px',
      borderRadius: '10px',
      fontSize: '13px',
      fontWeight: '600',
      cursor: 'pointer',
      border: `1px solid ${cancel ? colors.cardBorder : 'transparent'}`,
      background: destructive ? colors.danger : cancel ? 'transparent' : colors.primary,
      color: destructive || !cancel ? colors.bg : colors.textMuted,
    } as CSSStyleDeclaration)
    el.addEventListener('click', () => close(button))
    row.appendChild(el)
    // Focus the safe button so Enter never triggers a destructive action:
    // the cancel button if present, otherwise the first non-destructive one.
    if (cancel || (focusTarget === null && !destructive)) focusTarget = el
  }

  box.appendChild(row)
  overlay.appendChild(box)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close(cancelButton)
  })
  document.addEventListener('keydown', onKeyDown, true)
  document.body.appendChild(overlay)
  focusTarget?.focus()
}
