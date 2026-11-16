import { rangeHeader, amountText, totalLine, statusTag, visibleDays } from '../lib/historyFormat'
import type { Day } from '../lib/days'

describe('historyFormat', () => {
  it('formats range headers', () => {
    expect(rangeHeader('week', '2026-11-09', '2026-11-15')).toBe('Nov 9 – 15')
    expect(rangeHeader('week', '2026-10-27', '2026-11-02')).toBe('Oct 27 – Nov 2')
    expect(rangeHeader('month', '2026-11-01', '2026-11-30')).toBe('November 2026')
  })
  it('formats amounts', () => {
    expect(amountText({ net: 2340, status: 'under' })).toBe('2,340 under')
    expect(amountText({ net: -180, status: 'over' })).toBe('180 over')
    expect(amountText({ net: null, status: 'not_logged' })).toBe('—')
    expect(amountText({ net: null, status: 'no_whoop' })).toBe('—')
  })
  it('formats totals and tags', () => {
    expect(totalLine({ net: 2340, logged: 6, total: 7 })).toBe('2,340 kcal under · 6 of 7 days logged')
    expect(totalLine({ net: -50, logged: 1, total: 7 })).toBe('50 kcal over · 1 of 7 days logged')
    expect(totalLine({ net: 0, logged: 0, total: 7 })).toBe('No days logged yet')
    expect(statusTag('under')).toBeNull()
    expect(statusTag('no_whoop')).toBe('no Whoop data')
  })
  it('hides empty no_whoop days', () => {
    const mk = (status: Day['status'], n: number) => ({ status, logs: new Array(n) }) as unknown as Day
    expect(visibleDays([mk('no_whoop', 0), mk('no_whoop', 1), mk('not_logged', 0)])).toHaveLength(2)
  })
})
