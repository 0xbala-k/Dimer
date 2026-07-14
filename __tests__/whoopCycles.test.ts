import { summarizeCycles, type CycleRecord } from '../lib/whoopCycles'

// Whoop returns cycles sorted by start time descending, and the range query
// matches any cycle that *overlaps* the day — so yesterday's completed cycle
// shows up alongside today's ongoing one.
const ongoingToday: CycleRecord = {
  start: '2026-07-14T01:30:00.000Z',
  end: null,
  score: { kilojoule: 4184, strain: 8.2 }, // 1000 kcal
}

const completedYesterday: CycleRecord = {
  start: '2026-07-13T01:00:00.000Z',
  end: '2026-07-14T01:30:00.000Z',
  score: { kilojoule: 10460, strain: 14.1 }, // 2500 kcal
}

describe('summarizeCycles', () => {
  it('uses only the ongoing cycle, not the previous day carried in by overlap', () => {
    const result = summarizeCycles([ongoingToday, completedYesterday])
    expect(result.burned).toBe(1000)
    expect(result.strain).toBe(8.2)
  })

  it('falls back to the newest cycle when none is ongoing', () => {
    const result = summarizeCycles([
      { ...ongoingToday, end: '2026-07-14T20:00:00.000Z' },
      completedYesterday,
    ])
    expect(result.burned).toBe(1000)
    expect(result.strain).toBe(8.2)
  })

  it('handles an empty collection', () => {
    const result = summarizeCycles([])
    expect(result.burned).toBe(0)
    expect(result.strain).toBeNull()
  })

  it('handles a cycle with no score yet', () => {
    const result = summarizeCycles([{ start: '2026-07-14T01:30:00.000Z', end: null }])
    expect(result.burned).toBe(0)
    expect(result.strain).toBeNull()
  })
})
