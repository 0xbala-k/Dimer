import { useEffect, useRef, useState, createElement } from 'react'
import { View, Text, Pressable, TextInput, ActivityIndicator, StyleSheet } from 'react-native'
import { fetchByBarcode } from '../lib/openfoodfacts'
import { showAlert } from '../lib/alert'
import { colors, fonts, radii } from '../lib/theme'
import type { FoodResult } from '../lib/types'

interface Props {
  onResult: (result: FoodResult) => void
}

// BarcodeDetector is not in this project's lib.dom types — declare a minimal shape.
type BarcodeDetectorLike = {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}

const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code']

function scannerSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'BarcodeDetector' in window &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  )
}

export function BarcodeInput({ onResult }: Props) {
  const [scanning, setScanning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [manual, setManual] = useState('')

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const handledRef = useRef(false)

  const supported = scannerSupported()

  function stopCamera() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  // Cleanup on unmount.
  useEffect(() => stopCamera, [])

  async function lookup(barcode: string) {
    if (loading) return
    setLoading(true)
    try {
      const result = await fetchByBarcode(barcode.trim())
      if (!result) {
        showAlert('Product not found', "This barcode isn't in Open Food Facts. Try text entry instead.", [
          { text: 'OK', onPress: () => { handledRef.current = false } },
        ])
        return
      }
      stopCamera()
      setScanning(false)
      onResult(result)
    } catch {
      showAlert('Scan failed', 'Check your connection and try again.')
      handledRef.current = false
    } finally {
      setLoading(false)
    }
  }

  async function handleOpen() {
    setScanning(true)
    handledRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      video.srcObject = stream
      video.setAttribute('playsinline', 'true')
      await video.play()

      const detector: BarcodeDetectorLike = new (window as any).BarcodeDetector({ formats: BARCODE_FORMATS })

      let lastCheck = 0
      const tick = async (now: number) => {
        if (handledRef.current || !videoRef.current) return
        if (now - lastCheck >= 200) {
          lastCheck = now
          try {
            const codes = await detector.detect(videoRef.current)
            if (codes.length > 0 && !handledRef.current) {
              handledRef.current = true
              await lookup(codes[0].rawValue)
              return
            }
          } catch {
            // Transient decode errors are expected between frames — keep polling.
          }
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      showAlert('Camera unavailable', 'Could not access the camera. Enter the barcode number below instead.')
      stopCamera()
      setScanning(false)
    }
  }

  function handleCancel() {
    stopCamera()
    setScanning(false)
    handledRef.current = false
  }

  function handleManualSubmit() {
    const value = manual.trim()
    if (!value) return
    handledRef.current = true
    lookup(value)
  }

  return (
    <View style={s.container}>
      {scanning ? (
        <View style={s.scannerWrap}>
          {createElement('video', {
            ref: videoRef,
            muted: true,
            autoPlay: true,
            playsInline: true,
            style: { width: '100%', height: '100%', objectFit: 'cover' },
          })}
          {loading && (
            <View style={s.overlay}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={s.overlayText}>Looking up barcode…</Text>
            </View>
          )}
          <View style={s.frame} />
          <Pressable style={s.cancelBtn} onPress={handleCancel}>
            <Text style={s.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={s.hint}>Scan a product barcode to get nutrition data from Open Food Facts (free, no API key).</Text>
          {supported && (
            <Pressable style={({ pressed }) => [s.btn, pressed && { opacity: 0.85 }]} onPress={handleOpen}>
              <Text style={s.btnText}>Open Scanner →</Text>
            </Pressable>
          )}
        </>
      )}

      <View style={s.manualBlock}>
        <Text style={s.manualLabel}>
          {supported ? 'Or enter the barcode number manually.' : 'Enter the barcode number manually.'}
        </Text>
        <View style={s.manualRow}>
          <TextInput
            style={s.input}
            value={manual}
            onChangeText={setManual}
            keyboardType="numeric"
            placeholder="Enter barcode number"
            placeholderTextColor={colors.textDim}
            editable={!loading}
            onSubmitEditing={handleManualSubmit}
          />
          <Pressable
            style={({ pressed }) => [s.submitBtn, (pressed || loading) && { opacity: 0.85 }]}
            onPress={handleManualSubmit}
            disabled={loading}
          >
            {loading && !scanning ? (
              <ActivityIndicator color={colors.bg} size="small" />
            ) : (
              <Text style={s.btnText}>Look up</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { gap: 16, padding: 4 },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  btn: { padding: 14, backgroundColor: colors.primary, borderRadius: radii.md, alignItems: 'center' },
  btnText: { fontFamily: fonts.labelSemiBold, fontSize: 12, color: colors.bg, textTransform: 'uppercase', letterSpacing: 1 },
  scannerWrap: { height: 300, borderRadius: radii.lg, overflow: 'hidden', position: 'relative', backgroundColor: colors.bg },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,11,20,0.7)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  overlayText: { fontFamily: fonts.label, fontSize: 13, color: colors.text },
  frame: { position: 'absolute', width: 200, height: 120, borderWidth: 2, borderColor: colors.primary, borderRadius: 8, top: '50%', left: '50%', transform: [{ translateX: -100 }, { translateY: -60 }] },
  cancelBtn: { position: 'absolute', bottom: 12, alignSelf: 'center', padding: 10, backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1, borderColor: colors.cardBorder },
  cancelText: { fontFamily: fonts.labelSemiBold, fontSize: 12, color: colors.textMuted },
  manualBlock: { gap: 8 },
  manualLabel: { fontFamily: fonts.label, fontSize: 12, color: colors.textMuted },
  manualRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  input: {
    flex: 1,
    padding: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  submitBtn: { paddingHorizontal: 16, justifyContent: 'center', backgroundColor: colors.primary, borderRadius: radii.md, alignItems: 'center', minWidth: 96 },
})
