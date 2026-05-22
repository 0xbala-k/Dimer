import { useState } from 'react'
import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native'
import { BarCodeScanner, BarCodeScannerResult } from 'expo-barcode-scanner'
import { fetchByBarcode } from '../lib/openfoodfacts'
import { colors, fonts, radii } from '../lib/theme'
import type { FoodResult } from '../lib/types'

interface Props {
  onResult: (result: FoodResult) => void
}

export function BarcodeInput({ onResult }: Props) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [scanned, setScanned] = useState(false)
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)

  async function requestPermission() {
    const { status } = await BarCodeScanner.requestPermissionsAsync()
    setHasPermission(status === 'granted')
    if (status === 'granted') setScanning(true)
  }

  async function handleScan({ data }: BarCodeScannerResult) {
    if (scanned || loading) return
    setScanned(true)
    setLoading(true)
    try {
      const result = await fetchByBarcode(data)
      if (!result) {
        Alert.alert('Product not found', 'This barcode isn\'t in Open Food Facts. Try text entry instead.', [
          { text: 'OK', onPress: () => { setScanned(false); setLoading(false) } },
        ])
        return
      }
      onResult(result)
    } catch {
      Alert.alert('Scan failed', 'Check your connection and try again.')
      setScanned(false)
    } finally {
      setLoading(false)
    }
  }

  if (!scanning) {
    return (
      <View style={s.container}>
        <Text style={s.hint}>Scan a product barcode to get nutrition data from Open Food Facts (free, no API key).</Text>
        <Pressable style={({ pressed }) => [s.btn, pressed && { opacity: 0.85 }]} onPress={requestPermission}>
          <Text style={s.btnText}>Open Scanner →</Text>
        </Pressable>
        {hasPermission === false && (
          <Text style={s.warning}>Camera permission denied. Enable it in Settings → Dimer.</Text>
        )}
      </View>
    )
  }

  return (
    <View style={s.scannerWrap}>
      <BarCodeScanner onBarCodeScanned={handleScan} style={StyleSheet.absoluteFillObject} />
      {loading && (
        <View style={s.overlay}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={s.overlayText}>Looking up barcode…</Text>
        </View>
      )}
      <View style={s.frame} />
      <Pressable style={s.cancelBtn} onPress={() => setScanning(false)}>
        <Text style={s.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  )
}

const s = StyleSheet.create({
  container: { gap: 12, padding: 4 },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  btn: { padding: 14, backgroundColor: colors.primary, borderRadius: radii.md, alignItems: 'center' },
  btnText: { fontFamily: fonts.labelSemiBold, fontSize: 12, color: colors.bg, textTransform: 'uppercase', letterSpacing: 1 },
  warning: { fontFamily: fonts.label, fontSize: 11, color: colors.danger, textAlign: 'center' },
  scannerWrap: { height: 300, borderRadius: radii.lg, overflow: 'hidden', position: 'relative' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,11,20,0.7)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  overlayText: { fontFamily: fonts.label, fontSize: 13, color: colors.text },
  frame: { position: 'absolute', width: 200, height: 120, borderWidth: 2, borderColor: colors.primary, borderRadius: 8, top: '50%', left: '50%', transform: [{ translateX: -100 }, { translateY: -60 }] },
  cancelBtn: { position: 'absolute', bottom: 12, alignSelf: 'center', padding: 10, backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1, borderColor: colors.cardBorder },
  cancelText: { fontFamily: fonts.labelSemiBold, fontSize: 12, color: colors.textMuted },
})
