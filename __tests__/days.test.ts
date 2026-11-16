import { dayLabel, groupIntoDays, periodRange, shiftAnchor, periodTotal, type Day } from '../lib/days'
import { localDateString } from '../lib/date'
import type { FoodLog, WhoopCycleRow } from '../lib/types'

const cycle = (id: number, start: string, end: string | null, burned: number | null, tz: string | null = '-08:00'): WhoopCycleRow => ({
  user_id: 'u', cycle_id: id, start, end, tz_offset: tz, day: '2026-01-01',
  score_state: burned == null ? 'PENDING_SCORE' : 'SCORED', burned, strain: null,
})
const log = (id: string, at: string, calories: number): FoodLog => ({
  id, user_id: 'u', logged_at: at, date: at.slice(0, 10), source: 'text', name: id,
  calories, protein: 10, carbs: 20, fats: 5, fiber: 2,
})

describe('dayLabel', () => {
  it('uses the cycle offset (Fri 23:00 local -> Saturday)', () => {
    expect(dayLabel('2026-11-14T07:00:00Z', '-08:00')).toBe('2026-11-14')
  })
  it('Sat 02:00 local', () => {
    expect(dayLabel('2026-11-14T10:00:00Z', '-08:00')).toBe('2026-11-14')
  })
  it('positive offset', () => {
    expect(dayLabel('2026-11-14T07:00:00Z', '+05:30')).toBe('2026-11-15')
  })
})

describe('groupIntoDays', () => {
  const t0 = '2026-11-10T08:00:00.000Z'
  const t1 = '2026-11-11T08:00:00.000Z'
  const now = new Date('2026-11-11T20:00:00.000Z')

  it('assigns logs to half-open cycle windows', () => {
    const days = groupIntoDays(
      [cycle(1, t0, t1, 2500), cycle(2, t1, null, 2000)],
      [log('a', '2026-11-10T09:00:00.000Z', 500), log('b', t1, 300), log('c', '2026-11-11T10:00:00.000Z', 400)],
      now,
    )
    expect(days.map((d) => d.key)).toEqual(['2', '1'])
    expect(days[1].logs).toHaveLength(1)
    expect(days[0].logs).toHaveLength(2)
    expect(days[0].inProgress).toBe(true)
    expect(days[0].status).toBe('in_progress')
    expect(days[0].net).toBe(2000 - 700)
    expect(days[0].eaten).toBe(700)
    expect(days[0].macros.protein).toBe(20)
  })

  it('puts logs before every cycle into a no_whoop fallback day', () => {
    const at = '2026-11-05T19:00:00.000Z'
    const days = groupIntoDays([cycle(1, t0, t1, 2500)], [log('x', at, 400)], now)
    const fb = days.find((d) => d.cycle === null)!
    expect(fb.key).toBe(`d-${localDateString(new Date(at))}`)
    expect(fb.label).toBe(localDateString(new Date(at)))
    expect(fb.status).toBe('no_whoop')
    expect(fb.burned).toBeNull()
    expect(fb.net).toBeNull()
    expect(fb.eaten).toBe(400)
  })

  it('closed cycle with burn and no logs is not_logged', () => {
    const [d] = groupIntoDays([cycle(1, t0, t1, 2500)], [], now)
    expect(d.status).toBe('not_logged')
    expect(d.net).toBeNull()
  })

  it('over when eaten exceeds burn', () => {
    const [d] = groupIntoDays([cycle(1, t0, t1, 2000)], [log('a', '2026-11-10T12:00:00.000Z', 2300)], now)
    expect(d.status).toBe('over')
    expect(d.net).toBe(-300)
  })

  it('net 0 is under', () => {
    const [d] = groupIntoDays([cycle(1, t0, t1, 500)], [log('a', '2026-11-10T12:00:00.000Z', 500)], now)
    expect(d.status).toBe('under')
    expect(d.net).toBe(0)
  })

  it('open cycle with no food is in_progress with null net', () => {
    const [d] = groupIntoDays([cycle(2, t1, null, 800)], [], now)
    expect(d.status).toBe('in_progress')
    expect(d.net).toBeNull()
  })

  it('unscored closed cycle with food is no_whoop with null net', () => {
    const [d] = groupIntoDays([cycle(1, t0, t1, null)], [log('a', '2026-11-10T12:00:00.000Z', 500)], now)
    expect(d.status).toBe('no_whoop')
    expect(d.net).toBeNull()
    expect(d.eaten).toBe(500)
  })

  it('unscored open cycle with food is in_progress with null net', () => {
    const [d] = groupIntoDays([cycle(2, t1, null, null)], [log('a', '2026-11-11T12:00:00.000Z', 500)], now)
    expect(d.status).toBe('in_progress')
    expect(d.net).toBeNull()
  })
})

describe('periodTotal', () => {
  const mk = (status: Day['status'], net: number | null) => ({ status, net }) as Day
  it('sums only logged days', () => {
    const days = [mk('under', 500), mk('over', -300), mk('not_logged', null), mk('no_whoop', null), mk('in_progress', 200)]
    expect(periodTotal(days)).toEqual({ net: 400, logged: 3, total: 5 })
  })
  it('excludes in_progress with null net', () => {
    expect(periodTotal([mk('in_progress', null)])).toEqual({ net: 0, logged: 0, total: 1 })
  })
})

describe('periodRange / shiftAnchor', () => {
  it('week starts Monday', () => {
    expect(periodRange('week', new Date(2026, 10, 15))).toEqual({ from: '2026-11-09', to: '2026-11-15' })
  })
  it('month', () => {
    expect(periodRange('month', new Date(2026, 10, 15))).toEqual({ from: '2026-11-01', to: '2026-11-30' })
  })
  it('shift week back', () => {
    expect(periodRange('week', shiftAnchor('week', new Date(2026, 10, 15), -1))).toEqual({ from: '2026-11-02', to: '2026-11-08' })
  })
  it('shift month clamps day', () => {
    expect(periodRange('month', shiftAnchor('month', new Date(2026, 0, 31), 1))).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
})
