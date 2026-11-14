import { useEffect, useRef, useState, createElement } from 'react'
import { View, Text, Pressable, TextInput, ActivityIndicator, StyleSheet } from 'react-native'
import type { ScannerControls } from '../lib/barcodeScanner.web'
import { lookupBarcode, barcodeStyles as sb } from './barcodeShared'
import { cameraErrorMessage } from '../lib/barcode'
import { colors, fonts, radii } from '../lib/theme'
import type { FoodResult } from '../lib/types'

interface Props {
  onResult: (result: FoodResult) => void
  /** False while the Log Food sheet is closed; stops the camera. */
  active?: boolean
}

const VIDEO_STYLE = { width: '100%', height: '100%', objectFit: 'cover' } as const

function cameraAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

/**
 * Starts the camera scanner (see lib/barcodeScanner.web.ts). The module is
 * loaded on demand, so the decoder is only downloaded when the user taps Scan.
 */
async function startScanner(video: HTMLVideoElement, onCode: (code: string) => void): Promise<ScannerControls> {
  const scanner = await import('../lib/barcodeScanner.web')
  return scanner.startScanner(video, onCode)
}

export function BarcodeInput({ onResult, active = true }: Props) {
  const [scanning, setScanning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [manual, setManual] = useState('')
  const [cameraError, setCameraError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  // True while a code is being looked up: ignores further hits without
  // stopping the camera, so a not-found result resumes scanning.
  const busyRef = useRef(false)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  const canScan = cameraAvailable()

  // Closing the sheet stops the camera.
  useEffect(() => {
    if (!active) setScanning(false)
  }, [active])

  // Runs the camera while `scanning` is true. The cleanup stops it on cancel,
  // success, sheet close, tab switch and unmount.
  useEffect(() => {
    if (!scanning) return
    const video = videoRef.current
    if (!video) return

    let cancelled = false
    let controls: ScannerControls | null = null
    busyRef.current = false
    setStarting(true)

    function handleCode(code: string) {
      if (cancelled || busyRef.current) return
      busyRef.current = true
      setLoading(true)
      lookupBarcode(
        code,
        (result) => {
          if (cancelled) return
          setScanning(false)
          onResultRef.current(result)
        },
        () => {
          busyRef.current = false
        }
      ).finally(() => {
        if (!cancelled) setLoading(false)
      })
    }

    startScanner(video, handleCode)
      .then((c) => {
        if (cancelled) {
          c.stop()
          return
        }
        controls = c
        setStarting(false)
      })
      .catch((error) => {
        if (cancelled) return
        setCameraError(cameraErrorMessage(error))
        setStarting(false)
        setScanning(false)
      })

    return () => {
      cancelled = true
      controls?.stop()
      // Belt and braces: release the stream even if the scanner has not finished starting.
      const stream = video.srcObject as MediaStream | null
      stream?.getTracks().forEach((t) => t.stop())
      video.srcObject = null
      busyRef.current = false
      setStarting(false)
      setLoading(false)
    }
  }, [scanning])

  function handleOpen() {
    setCameraError(null)
    setScanning(true)
  }

  async function handleManualSubmit() {
    const value = manual.trim()
    if (!value || loading) return
    // Pause live detection (if the scanner is open) while this lookup runs.
    busyRef.current = true
    setLoading(true)
    await lookupBarcode(
      value,
      (result) => {
        setScanning(false)
        onResult(result)
      },
      () => {
        busyRef.current = false
      }
    )
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
          {(starting || loading) && (
            <View style={sb.overlay}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={sb.overlayText}>{loading ? 'Looking up barcode…' : 'Starting camera…'}</Text>
            </View>
          )}
          <View style={sb.frame} />
          <Pressable style={sb.cancelBtn} onPress={() => setScanning(false)}>
            <Text style={sb.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={sb.hint}>Scan a product barcode to get nutrition data from Open Food Facts (free, no API key).</Text>
          {canScan ? (
            <Pressable
              style={({ pressed }) => [sb.btn, pressed && { opacity: 0.85 }]}
              onPress={handleOpen}
              accessibilityLabel="Scan barcode with camera"
            >
              <Text style={sb.btnText}>Scan with Camera →</Text>
            </Pressable>
          ) : (
            <Text style={s.warning}>Camera scanning isn't available in this browser. Open the app over HTTPS, or enter the number below.</Text>
          )}
          {cameraError && <Text style={s.warning}>{cameraError}</Text>}
        </>
      )}

      <View style={s.manualBlock}>
        <Text style={s.manualLabel}>
          {canScan ? 'Or enter the barcode number manually.' : 'Enter the barcode number manually.'}
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
  warning: { fontFamily: fonts.label, fontSize: 12, color: colors.danger, lineHeight: 18 },
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
