import { StyleSheet } from 'react-native'
import { fetchByBarcode } from '../lib/openfoodfacts'
import { showAlert } from '../lib/alert'
import { colors, fonts, radii } from '../lib/theme'
import type { FoodResult } from '../lib/types'

/**
 * Shared barcode-lookup flow for the native and web BarcodeInput variants:
 * fetches the code from Open Food Facts, calls onResult on a hit, and shows
 * the standard not-found / network-failure alerts otherwise. onRetry runs
 * whenever the caller should resume scanning / accepting input.
 */
export async function lookupBarcode(
  code: string,
  onResult: (result: FoodResult) => void,
  onRetry: () => void
): Promise<void> {
  try {
    const result = await fetchByBarcode(code.trim())
    if (!result) {
      showAlert('Product not found', "This barcode isn't in Open Food Facts. Try text entry instead.", [
        { text: 'OK', onPress: onRetry },
      ])
      return
    }
    onResult(result)
  } catch {
    showAlert('Scan failed', 'Check your connection and try again.')
    onRetry()
  }
}

// colors.bg (#070B14) at 70% alpha
const scrim = 'rgba(7,11,20,0.7)'

/** Styles shared verbatim by BarcodeInput.tsx and BarcodeInput.web.tsx. */
export const barcodeStyles = StyleSheet.create({
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  btn: { padding: 14, backgroundColor: colors.primary, borderRadius: radii.md, alignItems: 'center' },
  btnText: { fontFamily: fonts.labelSemiBold, fontSize: 12, color: colors.bg, textTransform: 'uppercase', letterSpacing: 1 },
  scannerWrap: { height: 300, borderRadius: radii.lg, overflow: 'hidden', position: 'relative', backgroundColor: colors.bg },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: scrim, alignItems: 'center', justifyContent: 'center', gap: 12 },
  overlayText: { fontFamily: fonts.label, fontSize: 13, color: colors.text },
  frame: { position: 'absolute', width: 200, height: 120, borderWidth: 2, borderColor: colors.primary, borderRadius: 8, top: '50%', left: '50%', transform: [{ translateX: -100 }, { translateY: -60 }] },
  cancelBtn: { position: 'absolute', bottom: 12, alignSelf: 'center', padding: 10, backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1, borderColor: colors.cardBorder },
  cancelText: { fontFamily: fonts.labelSemiBold, fontSize: 12, color: colors.textMuted },
})
