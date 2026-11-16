import type { Day, Period } from './days'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function parts(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number)
  return { y, m: m - 1, d }
}

/** "Nov 9 – 15", "Oct 27 – Nov 2", or "November 2026". */
export function rangeHeader(period: Period, from: string, to: string): string {
  const a = parts(from)
  if (period === 'month') return `${MONTHS_LONG[a.m]} ${a.y}`
  const b = parts(to)
  return a.m === b.m ? `${MONTHS[a.m]} ${a.d} – ${b.d}` : `${MONTHS[a.m]} ${a.d} – ${MONTHS[b.m]} ${b.d}`
}

/** "Sun 15" for a YYYY-MM-DD label. */
export function rowLabel(label: string): string {
  const { y, m, d } = parts(label)
  const wd = new Date(y, m, d).toLocaleDateString('en-US', { weekday: 'short' })
  return `${wd} ${d}`
}

export function amountText(day: Pick<Day, 'net' | 'status'>): string {
  if (day.net === null || day.status === 'not_logged' || day.status === 'no_whoop') return '—'
  return `${Math.abs(day.net).toLocaleString()} ${day.net >= 0 ? 'under' : 'over'}`
}

export function statusTag(status: Day['status']): string | null {
  if (status === 'in_progress') return 'in progress'
  if (status === 'not_logged') return 'not logged'
  if (status === 'no_whoop') return 'no Whoop data'
  return null
}

export function totalLine(t: { net: number; logged: number; total: number }): string {
  if (t.logged === 0) return 'No days logged yet'
  return `${Math.abs(t.net).toLocaleString()} kcal ${t.net >= 0 ? 'under' : 'over'} · ${t.logged} of ${t.total} days logged`
}

/** Days shown in the list: closed unscored cycles with nothing eaten carry no information. */
export function visibleDays(days: Day[]): Day[] {
  return days.filter((d) => !(d.status === 'no_whoop' && d.logs.length === 0))
}
