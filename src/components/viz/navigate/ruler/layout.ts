/**
 * Geometry of B's timeline: the earlier evenly spaced timeline
 * (render/TimelineView.vue, `spacing="even"`) carried by the ruler's
 * reading interaction.
 *
 * Even spacing, as in the earlier renderer: events sit on equal slots in date
 * order, alternating above and below one line; a block spans up to two slots,
 * so neighbours on the same side never touch. Distance is order, not elapsed
 * time: there are no year ticks and no gap annotations.
 *
 * The same marks have two vertical geometries:
 *   rich     blocks (image, date, short label) on stems above and below the line
 *   compact  the line and dots only, drawn up under the header
 * Horizontal positions depend only on the slot width, so they never move
 * between presentations, filters or selections.
 */
import type { NavEvent } from '../events'

/** One motion value for every presentation change (Codex `--transition-timing-function-user` easing). */
export const MOTION_MS = 240

/**
 * Slots: about six and a half events across the column (five to seven fully
 * readable, part of the next one as the cue to scroll sideways); on phones
 * about two and a half. Blocks span up to two slots (neighbours on the same
 * side are two slots apart).
 */
export function slotFor(width: number, narrow: boolean) {
  const w = width || 600
  return narrow ? Math.min(150, Math.max(120, w / 2.6)) : Math.min(180, Math.max(130, w / 6.5))
}
export const blockFor = (slot: number, narrow: boolean) => Math.min(2 * slot - 2 * BLOCK_PAD, narrow ? 210 : 240)

// Type and block metrics (px), matched to the CSS in EvenTrack.vue.
export const STEM = 12
export const DATE_LINE = 24
export const LABEL_LINE = 20
export const IMG_GAP = 6
export const BLOCK_PAD = 8

/** Compact strip: the line near the top and the reading caret under it (no captions). */
export const COMPACT = { axisY: 9, height: 22 }
/** The phone's always-visible overview of every event. */
export const MINI_H = 22

export const above = (i: number) => i % 2 === 0

/** How much of each block fits: label lines and image height, richest first. */
export interface Richness {
  lines: number
  imgH: number
}
const LADDER: Richness[] = [
  { lines: 3, imgH: 64 },
  { lines: 2, imgH: 56 },
  { lines: 2, imgH: 48 },
  { lines: 2, imgH: 40 },
  { lines: 2, imgH: 32 },
  { lines: 2, imgH: 0 },
  { lines: 1, imgH: 0 },
]
/** One small rectangular format (3:2), its height fitted to the panel. */
export const imgWidth = (imgH: number) => Math.round(imgH * 1.5)

export interface RichLayout extends Richness {
  aboveH: number
  belowH: number
  /** Height of the drawn track (without a scrollbar). */
  height: number
}
function sideH(r: Richness, hasImg: boolean) {
  return STEM + DATE_LINE + r.lines * LABEL_LINE + (hasImg && r.imgH ? r.imgH + IMG_GAP : 0) + 2
}
/**
 * The richest blocks that fit `budget` px of track. Ages are left out, image
 * height gives way first, then label lines; text is never scaled down.
 */
/** Label lines the longest label needs at this block width (14px text, about 7px a character). */
export function linesNeeded(events: NavEvent[], blockW: number): number {
  const perLine = Math.max(8, Math.floor((blockW - 8) / 7))
  return Math.min(3, Math.max(1, ...events.map((e) => Math.ceil(e.label.length / perLine))))
}
export function richLayout(events: NavEvent[], budget: number, maxLines = 3): RichLayout {
  const imgAbove = events.some((e, i) => above(i) && e.image)
  const imgBelow = events.some((e, i) => !above(i) && e.image)
  const make = (rr: Richness): RichLayout => {
    const r = { ...rr, lines: Math.min(rr.lines, maxLines) }
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
