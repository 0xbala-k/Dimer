import { currentDayStart } from '../lib/currentDay'
import { localDayBounds } from '../lib/date'

const now = new Date('2026-07-14T18:00:00.000Z')

describe('currentDayStart', () => {
  it('prefers the live cycle start', () => {
    expect(currentDayStart({ cycleStart: '2026-07-14T08:00:00.000Z' }, '2026-07-13T08:00:00.000Z', now))
      .toBe('2026-07-14T08:00:00.000Z')
  })
  it('uses the stored start when live is missing and it is recent', () => {
    expect(currentDayStart(null, '2026-07-14T08:00:00.000Z', now)).toBe('2026-07-14T08:00:00.000Z')
    expect(currentDayStart({ cycleStart: null }, '2026-07-14T08:00:00.000Z', now)).toBe('2026-07-14T08:00:00.000Z')
  })
  it('ignores a stored start older than 36h and uses local midnight', () => {
    expect(currentDayStart(null, '2026-07-12T08:00:00.000Z', now)).toBe(localDayBounds(now).start)
  })
  it('falls back to local midnight with nothing', () => {
    expect(currentDayStart(null, null, now)).toBe(localDayBounds(now).start)
  })
})
