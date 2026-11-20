import { dateYears } from './dates'
import type { Place } from './types'

/** Map list order: order is not meaningful on a map, so dated places by date, then undated ones by name. */
export function sortPlaces(places: Place[]): Place[] {
  return [...places].sort((a, b) => {
    if (a.date && b.date)
      return dateYears(a.date) - dateYears(b.date) || a.name.localeCompare(b.name)
    if (a.date) return -1
    if (b.date) return 1
    return a.name.localeCompare(b.name)
  })
}
