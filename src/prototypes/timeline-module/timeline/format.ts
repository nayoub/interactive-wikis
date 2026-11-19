import type { PartialDate, TimelineDate, TimelineEvent } from './types'

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function part(p: PartialDate, precision: TimelineDate['precision']): string {
  if (precision === 'day' && p.m && p.d) return `${MONTH_NAMES[p.m - 1]} ${p.d}, ${p.y}`
  if ((precision === 'day' || precision === 'month') && p.m) return `${MONTH_NAMES[p.m - 1]} ${p.y}`
  return String(p.y)
}

export function formatDate(date: TimelineDate): string {
  const c = date.circa ? 'c. ' : ''
  const { start, end } = date
  if (end && date.precision === 'year' && start.y % 10 === 0 && end.y === start.y + 9) {
    return `${c}${start.y}s`
  }
  if (end) {
    if (date.precision === 'year') return `${c}${start.y}–${end.y}`
    return `${c}${part(start, date.precision)} – ${part(end, date.precision)}`
  }
  return c + part(start, date.precision)
}

/** Compact form for axes and tight spots: year, or "1970s". */
export function formatShort(date: TimelineDate): string {
  const { start, end } = date
  if (end && start.y % 10 === 0 && end.y === start.y + 9) return `${start.y}s`
  if (end) return `${start.y}–${String(end.y).slice(-2)}`
  return (date.circa ? 'c. ' : '') + start.y
}

export function isoDate(date: TimelineDate): string {
  const p = date.start
  const pad = (n: number) => String(n).padStart(2, '0')
  if (date.precision === 'day' && p.m && p.d) return `${p.y}-${pad(p.m)}-${pad(p.d)}`
  if (date.precision !== 'year' && p.m) return `${p.y}-${pad(p.m)}`
  return String(p.y)
}

/** Decimal year for sorting and proportional spacing. */
export function toYears(p: PartialDate): number {
  return p.y + ((p.m ?? 1) - 1) / 12 + ((p.d ?? 1) - 1) / 365
}

export function sortEvents(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => toYears(a.date.start) - toYears(b.date.start))
}
