import { expandUpcE, normalizeScannedBarcode, cameraErrorMessage } from '../lib/barcode'

describe('expandUpcE', () => {
  // Reference expansions for each UPC-E last-digit rule.
  it.each([
    ['01234565', '012345000065'], // last digit 5-9
    ['04252614', '042100005264'], // last digit 0-2
    ['01234531', '012300000451'], // last digit 3
    ['01234548', '012340000058'], // last digit 4
    ['12345670', '123456000070'], // number system 1, last digit 5-9
  ])('expands %s to %s', (upcE, upcA) => {
    expect(expandUpcE(upcE)).toBe(upcA)
  })

  it('rejects codes that are not UPC-E', () => {
    expect(expandUpcE('1234567')).toBeNull()
    expect(expandUpcE('23456789')).toBeNull() // number system must be 0 or 1
    expect(expandUpcE('0123456a')).toBeNull()
  })
})

describe('normalizeScannedBarcode', () => {
  it('expands UPC-E hits', () => {
    expect(normalizeScannedBarcode('04252614', 'upc_e')).toBe('042100005264')
  })

  it('passes other formats through, trimmed', () => {
    expect(normalizeScannedBarcode(' 3017620422003 ', 'ean_13')).toBe('3017620422003')
    expect(normalizeScannedBarcode('96385074', 'ean_8')).toBe('96385074')
    expect(normalizeScannedBarcode('042100005264', 'upc_a')).toBe('042100005264')
  })
})

describe('cameraErrorMessage', () => {
  it('explains a denied permission', () => {
    expect(cameraErrorMessage({ name: 'NotAllowedError' })).toMatch(/blocked/)
  })

  it('explains a scanner download failure', () => {
    expect(cameraErrorMessage({ name: 'ScannerLoadError' })).toMatch(/Couldn't load the barcode scanner/)
  })

  it('falls back to a generic message', () => {
    expect(cameraErrorMessage(new Error('x'))).toMatch(/Could not start the camera/)
    expect(cameraErrorMessage(null)).toMatch(/Could not start the camera/)
  })
})
