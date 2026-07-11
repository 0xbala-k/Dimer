import { useState } from 'react'
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { lookupBarcode, barcodeStyles as sb } from './barcodeShared'
import { colors, fonts } from '../lib/theme'
import type { FoodResult } from '../lib/types'

interface Props {
  onResult: (result: FoodResult) => void
}

export function BarcodeInput({ onResult }: Props) {
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)

  async function handleOpen() {
    if (!permission?.granted) {
      const result = await requestPermission()
      if (!result.granted) return
    }
    setScanning(true)
  }

  async function handleScan({ data }: { data: string }) {
    if (scanned || loading) return
    setScanned(true)
    setLoading(true)
    await lookupBarcode(data, onResult, () => setScanned(false))
    setLoading(false)
  }

  if (!scanning) {
    return (
      <View style={s.container}>
        <Text style={sb.hint}>Scan a product barcode to get nutrition data from Open Food Facts (free, no API key).</Text>
        <Pressable style={({ pressed }) => [sb.btn, pressed && { opacity: 0.85 }]} onPress={handleOpen}>
          <Text style={sb.btnText}>Open Scanner →</Text>
        </Pressable>
        {permission?.granted === false && (
          <Text style={s.warning}>Camera permission denied. Enable it in Settings → Dimer.</Text>
        )}
      </View>
    )
  }

  return (
    <View style={sb.scannerWrap}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr'] }}
        onBarcodeScanned={scanned ? undefined : handleScan}
      />
      {loading && (
        <View style={sb.overlay}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={sb.overlayText}>Looking up barcode…</Text>
        </View>
      )}
      <View style={sb.frame} />
      <Pressable style={sb.cancelBtn} onPress={() => { setScanning(false); setScanned(false) }}>
        <Text style={sb.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  )
}

const s = StyleSheet.create({
  container: { gap: 12, padding: 4 },
  warning: { fontFamily: fonts.label, fontSize: 11, color: colors.danger, textAlign: 'center' },
})
