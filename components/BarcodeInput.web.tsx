import { useEffect, useRef, useState, createElement } from 'react'
import { View, Text, Pressable, TextInput, ActivityIndicator, StyleSheet } from 'react-native'
import { lookupBarcode, barcodeStyles as sb } from './barcodeShared'
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
const SCAN_INTERVAL_MS = 200
const VIDEO_STYLE = { width: '100%', height: '100%', objectFit: 'cover' } as const

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // True while a detected code is being looked up: pauses detection without
  // killing the scan loop, so a failed lookup resumes scanning.
  const busyRef = useRef(false)

  const supported = scannerSupported()

  function stopCamera() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    busyRef.current = false
  }

  // Cleanup on unmount.
  useEffect(() => stopCamera, [])

  function handleSuccess(result: FoodResult) {
    stopCamera()
    setScanning(false)
    onResult(result)
  }

  async function handleOpen() {
    setScanning(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        setScanning(false)
        return
      }
      video.srcObject = stream
      video.setAttribute('playsinline', 'true')
      await video.play()

      const detector: BarcodeDetectorLike = new (window as any).BarcodeDetector({ formats: BARCODE_FORMATS })

      const tick = async () => {
        // Camera was stopped (cancel/success/unmount) — end the loop.
        if (!streamRef.current || !videoRef.current) return
        if (!busyRef.current) {
          try {
            const codes = await detector.detect(videoRef.current)
            if (codes.length > 0 && !busyRef.current) {
              busyRef.current = true
              setLoading(true)
              await lookupBarcode(codes[0].rawValue, handleSuccess, () => {
                busyRef.current = false
              })
              setLoading(false)
            }
          } catch {
            // Transient decode errors are expected between frames — keep polling.
          }
        }
        // Always reschedule while the camera runs, so not-found / failed
        // lookups resume scanning instead of freezing the scanner.
        timerRef.current = setTimeout(tick, SCAN_INTERVAL_MS)
      }
      timerRef.current = setTimeout(tick, SCAN_INTERVAL_MS)
    } catch {
      showAlert('Camera unavailable', 'Could not access the camera. Enter the barcode number below instead.')
      stopCamera()
      setScanning(false)
    }
  }

  function handleCancel() {
    stopCamera()
    setScanning(false)
  }

  async function handleManualSubmit() {
    const value = manual.trim()
    if (!value || loading) return
    // Pause live detection (if the scanner is open) while this lookup runs.
    busyRef.current = true
    setLoading(true)
    await lookupBarcode(value, handleSuccess, () => {
      busyRef.current = false
    })
    setLoading(false)
  }

  return (
    <View style={s.container}>
      {scanning ? (
        <View style={sb.scannerWrap}>
          {createElement('video', {
            ref: videoRef,
            muted: true,
            autoPlay: true,
            playsInline: true,
            style: VIDEO_STYLE,
          })}
          {loading && (
            <View style={sb.overlay}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={sb.overlayText}>Looking up barcode…</Text>
            </View>
          )}
          <View style={sb.frame} />
          <Pressable style={sb.cancelBtn} onPress={handleCancel}>
            <Text style={sb.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={sb.hint}>Scan a product barcode to get nutrition data from Open Food Facts (free, no API key).</Text>
          {supported && (
            <Pressable style={({ pressed }) => [sb.btn, pressed && { opacity: 0.85 }]} onPress={handleOpen}>
              <Text style={sb.btnText}>Open Scanner →</Text>
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
              <Text style={sb.btnText}>Look up</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { gap: 16, padding: 4 },
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
