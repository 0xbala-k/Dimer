/**
 * Helpers for barcodes read by the web camera scanner. Pure functions, no
 * scanner library imports, so they are safe to use (and test) anywhere.
 */

/**
 * Expands an 8-digit UPC-E code into its 12-digit UPC-A form.
 *
 * Open Food Facts indexes products by their full UPC-A / EAN-13 number, so a
 * zero-suppressed UPC-E code read off a small package would otherwise miss.
 * Returns null if the input is not a valid-looking UPC-E code (8 digits,
 * number system 0 or 1).
 */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null
  const ns = code[0]
  const d = code.slice(1, 7)
  const check = code[7]
  const last = d[5]

  let body: string
  if (last === '0' || last === '1' || last === '2') {
    body = d[0] + d[1] + last + '0000' + d[2] + d[3] + d[4]
  } else if (last === '3') {
    body = d[0] + d[1] + d[2] + '00000' + d[3] + d[4]
  } else if (last === '4') {
    body = d[0] + d[1] + d[2] + d[3] + '00000' + d[4]
  } else {
    body = d[0] + d[1] + d[2] + d[3] + d[4] + '0000' + last
  }
  return ns + body + check
}

/**
 * Turns a scanner hit into the number to look up on Open Food Facts.
 * `format` is a BarcodeDetector format name such as 'upc_e' or 'ean_13'.
 *
 * The current web decoder (zxing-cpp) already reports UPC-E expanded to 13
 * digits, which passes through unchanged; the 8-digit expansion is a fallback
 * in case a decoder returns the compressed form.
 */
export function normalizeScannedBarcode(text: string, format: string): string {
  const code = text.trim()
  if (format === 'upc_e') return expandUpcE(code) ?? code
  return code
}

/** Message to show when the browser refuses or cannot open the camera. */
export function cameraErrorMessage(error: unknown): string {
  const name = (error as { name?: string } | null)?.name
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'Camera access is blocked. Allow the camera for this site (on iPhone: Settings → Apps → Safari → Camera), then try again, or enter the number below.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found on this device. Enter the barcode number below instead.'
    case 'ScannerLoadError':
      return "Couldn't load the barcode scanner. Check your connection and try again, or enter the number below."
    case 'NotReadableError':
    case 'AbortError':
      return 'The camera is in use by another app. Close it and try again, or enter the number below.'
    default:
      return 'Could not start the camera. Enter the barcode number below instead.'
  }
}
