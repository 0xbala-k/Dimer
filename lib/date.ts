/**
 * Today's date as YYYY-MM-DD in the device's local time zone.
 *
 * `new Date().toISOString().split('T')[0]` gives the UTC date, which in
 * California flips to "tomorrow" at 4–5 PM local time. Food logged in the
 * morning then vanished from "Today" every evening, and evening entries were
 * filed under the next day.
 */
export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Start and end of the local calendar day, as ISO timestamps (UTC). */
export function localDayBounds(d: Date = new Date()): { start: string; end: string } {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
  return { start: start.toISOString(), end: end.toISOString() }
}

/** Rejects with `label` if `promise` hasn't settled within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'timeout'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}
