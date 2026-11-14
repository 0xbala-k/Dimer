/**
 * Web camera barcode scanning.
 *
 * iOS Safari has no native BarcodeDetector, so this uses the `barcode-detector`
 * ponyfill: the same BarcodeDetector API, backed by ZXing-C++ compiled to
 * WebAssembly. BarcodeInput.web.tsx loads this module with a dynamic import, so
 * the library is fetched only when the user taps Scan (and never reaches the
 * native bundle). Keep every `barcode-detector` import in this file.
 *
 * The ~1 MB .wasm binary is fetched on first use from the jsDelivr URL the
 * library pins to its own zxing-wasm version, then cached by the browser.
 */
import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill'
import { normalizeScannedBarcode } from './barcode'

export interface ScannerControls {
  /** Stops scanning and releases the camera. Safe to call more than once. */
  stop(): void
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const
const SCAN_INTERVAL_MS = 150

/** Thrown when the scanner's WebAssembly decoder can't be downloaded. */
export class ScannerLoadError extends Error {
  name = 'ScannerLoadError'
}

/**
 * Opens the rear camera into `video` and calls `onCode` for each EAN-13, EAN-8,
 * UPC-A or UPC-E barcode read (UPC-E expanded to UPC-A). Rejects with the
 * browser's getUserMedia error (e.g. NotAllowedError) if the camera can't
 * start, or with ScannerLoadError if the decoder can't be loaded.
 */
export async function startScanner(
  video: HTMLVideoElement,
  onCode: (code: string) => void
): Promise<ScannerControls> {
  // Load the decoder and open the camera in parallel.
  const decoderReady = Promise.resolve(prepareZXingModule({ fireImmediately: true })).catch((e: unknown) => {
    throw new ScannerLoadError(e instanceof Error ? e.message : String(e))
  })
  const streamReady = navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' } },
  })

  let stream: MediaStream
  try {
    ;[, stream] = await Promise.all([decoderReady, streamReady])
  } catch (error) {
    // If only the decoder failed, the camera may already be open: release it.
    streamReady.then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => {})
    throw error
  }

  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const stop = () => {
    stopped = true
    if (timer !== null) clearTimeout(timer)
    stream.getTracks().forEach((t) => t.stop())
    if (video.srcObject === stream) video.srcObject = null
  }

  try {
    video.srcObject = stream
    video.muted = true
    video.setAttribute('playsinline', 'true')
    await video.play()
  } catch (error) {
    stop()
    throw error
  }

  const detector = new BarcodeDetector({ formats: [...FORMATS] })
  const tick = async () => {
    if (stopped) return
    try {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const codes = await detector.detect(video)
        if (!stopped && codes.length > 0) {
          onCode(normalizeScannedBarcode(codes[0].rawValue, codes[0].format))
        }
      }
    } catch {
      // A frame that fails to decode is expected; keep scanning.
    }
    if (!stopped) timer = setTimeout(tick, SCAN_INTERVAL_MS)
  }
  timer = setTimeout(tick, 0)

  return { stop }
}
