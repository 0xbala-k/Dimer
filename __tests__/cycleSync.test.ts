jest.mock('../lib/supabase', () => ({ supabase: {} }))
jest.mock('../lib/auth', () => ({ ensureUserRow: jest.fn() }))
jest.mock('../lib/whoop', () => ({ fetchCyclesPage: jest.fn(), getValidAccessToken: jest.fn() }))

import { syncFromIso, fetchAllCyclesSince } from '../lib/cycleSync'
import { toCycleRow } from '../lib/whoopCycles'

const NOW = new Date('2026-07-14T12:00:00.000Z')
const DAY = 86400_000
const ago = (d: number) => new Date(NOW.getTime() - d * DAY).toISOString()

describe('toCycleRow', () => {
  it('maps kJ to kcal, strain and day', () => {
    const row = toCycleRow({
      id: 7, start: '2026-07-13T01:00:00.000Z', end: null, timezone_offset: '-07:00',
      score_state: 'SCORED', score: { kilojoule: 10460, strain: 14.1 },
    }, 'u1')
    expect(row).toMatchObject({
      user_id: 'u1', cycle_id: 7, start: '2026-07-13T01:00:00.000Z', end: null,
      tz_offset: '-07:00', day: '2026-07-13', score_state: 'SCORED', burned: 2500, strain: 14.1,
    })
  })
  it('burned null without a score', () => {
    const row = toCycleRow({ id: 1, start: '2026-07-13T01:00:00.000Z', end: '2026-07-14T01:00:00.000Z', score_state: 'PENDING_SCORE' }, 'u1')
    expect(row?.burned).toBeNull()
    expect(row?.strain).toBeNull()
  })
  it('null without id or start', () => {
    expect(toCycleRow({ start: 'x' }, 'u')).toBeNull()
    expect(toCycleRow({ id: 1 }, 'u')).toBeNull()
  })
})

describe('syncFromIso', () => {
  it('uses the oldest open/pending cycle start', () => {
    const stored = [
      { start: ago(1), end: null, score_state: 'PENDING_SCORE' as const },
      { start: ago(3), end: ago(2), score_state: 'PENDING_SCORE' as const },
      { start: ago(5), end: ago(4), score_state: 'SCORED' as const },
    ]
    expect(syncFromIso(stored, null, NOW)).toBe(ago(3))
  })
  it('uses the max start when all scored', () => {
    const stored = [
      { start: ago(5), end: ago(4), score_state: 'SCORED' as const },
      { start: ago(3), end: ago(2), score_state: 'SCORED' as const },
    ]
    expect(syncFromIso(stored, null, NOW)).toBe(ago(3))
  })
  it('empty: earliest log within 30d', () => {
    expect(syncFromIso([], ago(10), NOW)).toBe(ago(10))
  })
  it('empty: log older than 30d clamps to now-30d', () => {
    expect(syncFromIso([], ago(90), NOW)).toBe(ago(30))
  })
  it('empty and no logs: now-30d', () => {
    expect(syncFromIso([], null, NOW)).toBe(ago(30))
  })
})

describe('fetchAllCyclesSince', () => {
  it('follows tokens and concatenates', async () => {
    const fn = jest.fn()
      .mockResolvedValueOnce({ records: [{ id: 1 }], next_token: 'a' })
      .mockResolvedValueOnce({ records: [{ id: 2 }], next_token: 'b' })
      .mockResolvedValueOnce({ records: [{ id: 3 }], next_token: null })
    const out = await fetchAllCyclesSince('s', fn)
    expect(fn).toHaveBeenCalledTimes(3)
    expect(fn).toHaveBeenNthCalledWith(2, 's', 'a')
    expect(out.map((r) => r.id)).toEqual([1, 2, 3])
  })
  it('stops at maxPages', async () => {
    const fn = jest.fn().mockResolvedValue({ records: [{ id: 1 }], next_token: 't' })
    await fetchAllCyclesSince('s', fn, 5)
    expect(fn).toHaveBeenCalledTimes(5)
  })
  it('stops on an empty page', async () => {
    const fn = jest.fn().mockResolvedValue({ records: [], next_token: 't' })
    await fetchAllCyclesSince('s', fn)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
