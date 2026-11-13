import { localDateString, localDayBounds, withTimeout } from '../lib/date'

describe('localDateString', () => {
  it('uses the local calendar date, not the UTC one', () => {
    const d = new Date(2026, 10, 12, 21, 30) // Nov 12, 9:30 PM local
    expect(localDateString(d)).toBe('2026-11-12')
  })

  it('zero-pads month and day', () => {
    expect(localDateString(new Date(2026, 0, 5, 8))).toBe('2026-01-05')
  })
})

describe('localDayBounds', () => {
  it('spans local midnight to local end of day', () => {
    const d = new Date(2026, 10, 12, 21, 30)
    const { start, end } = localDayBounds(d)
    expect(new Date(start).getTime()).toBe(new Date(2026, 10, 12, 0, 0, 0, 0).getTime())
    expect(new Date(end).getTime()).toBe(new Date(2026, 10, 12, 23, 59, 59, 999).getTime())
  })
})

describe('withTimeout', () => {
  it('resolves when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(1), 50)).resolves.toBe(1)
  })

  it('rejects when the promise hangs', async () => {
    await expect(withTimeout(new Promise(() => {}), 10, 'hung')).rejects.toThrow('hung')
  })
})
