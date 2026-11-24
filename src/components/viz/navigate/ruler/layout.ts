/**
 * Geometry of B's timeline: the earlier evenly spaced timeline
 * (render/TimelineView.vue, `spacing="even"`) carried by the ruler's
 * reading interaction.
 *
 * Even spacing, as in the earlier renderer: event i sits at the centre of
 * slot i + 1 (half a slot of margin at each end), alternating above and below
 * one line; each block spans two slots, so neighbours on the same side never
 * touch. Distance is order, not elapsed time: gaps of `GAP_YEARS` or more are
 * drawn dotted and labelled with their length, and there are no year ticks.
 *
 * The same marks have two vertical geometries:
 *   rich     blocks (image, date, short label) on stems above and below the line
 *   compact  the line and dots only, drawn up under the header, with years
 * Horizontal positions depend only on the slot width, so they never move
 * between presentations, filters or selections.
 */
import type { NavEvent } from '../events'
import { dateYears } from '../../model/dates'
import { interval } from '../time'

/** One motion value for every presentation change (Codex `--transition-timing-function-user` easing). */
export const MOTION_MS = 240

/** Narrowest slot before the track scrolls sideways (the earlier renderer's `--viz-slot-min`). */
export const SLOT_MIN = 80
export const SLOT_MIN_PHONE = 88
/** Gaps of at least this many years are dotted and labelled (`--viz-gap-years`). */
export const GAP_YEARS = 8

// Type and block metrics (px), matched to the CSS in EvenTrack.vue.
export const STEM = 14
export const DATE_LINE = 24
export const LABEL_LINE = 20
export const IMG_GAP = 6
export const BLOCK_PAD = 8

/** Compact strip: the line near the top, the reading caret under it, then years. */
export const COMPACT = { axisY: 9, height: 36 }
/** The phone's always-visible overview of every event. */
export const MINI_H = 32

export const slotWidth = (n: number, width: number, min: number) => Math.max(min, width / (n + 1))
export const cx = (i: number, slot: number) => slot * (i + 1)
export const above = (i: number) => i % 2 === 0

export interface Gap {
  /** The gap before event i. */
  i: number
  years: number
  skipped: boolean
  label: string | null
}
export function gaps(events: NavEvent[]): Gap[] {
  const ys = events.map((e) => dateYears(e.date))
  return events.slice(1).map((_, k) => {
    const i = k + 1
    const years = Math.round(ys[i] - ys[i - 1])
    const skipped = years >= GAP_YEARS
    return { i, years, skipped, label: skipped ? `${years} yrs` : null }
  })
}

/** How much of each block fits: label lines and image height, richest first. */
export interface Richness {
  lines: number
  imgH: number
}
const LADDER: Richness[] = [
  { lines: 3, imgH: 64 },
  { lines: 3, imgH: 48 },
  { lines: 2, imgH: 48 },
  { lines: 2, imgH: 40 },
  { lines: 3, imgH: 0 },
  { lines: 2, imgH: 0 },
  { lines: 1, imgH: 0 },
]
export const imgWidth = (imgH: number) => (imgH >= 60 ? 96 : 72)

export interface RichLayout extends Richness {
  aboveH: number
  belowH: number
  /** Height of the drawn track (without a scrollbar). */
  height: number
}
function sideH(r: Richness, hasImg: boolean) {
  return STEM + DATE_LINE + r.lines * LABEL_LINE + (hasImg && r.imgH ? r.imgH + IMG_GAP : 0) + 4
}
/**
 * The richest blocks that fit `budget` px of track. Ages are left out, image
 * height gives way first, then label lines; text is never scaled down.
 */
export function richLayout(events: NavEvent[], budget: number): RichLayout {
  const imgAbove = events.some((e, i) => above(i) && e.image)
  const imgBelow = events.some((e, i) => !above(i) && e.image)
  const make = (r: Richness): RichLayout => {
    const aboveH = sideH(r, imgAbove)
    const belowH = sideH(r, imgBelow)
    return { ...r, aboveH, belowH, height: aboveH + belowH }
  }
  for (const r of LADDER) {
    const l = make(r)
    if (l.height <= budget) return l
  }
  return make(LADDER[LADDER.length - 1])
}

/** The real date bounds of a run of events (for a range picked on the even axis). */
export function boundsOf(list: NavEvent[]): [number, number] | null {
  if (!list.length) return null
  const iv = list.map((e) => interval(e.date))
  return [Math.min(...iv.map((v) => v[0])), Math.max(...iv.map((v) => v[1]))]
}
