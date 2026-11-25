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
 *   rich     blocks on stems above and below the line: the date next to the
 *            stem, then the title, then the photograph furthest out
 *   compact  the line and its points with every date still beside its point,
 *            in two tight alternating rows; titles and photographs withdraw
 * Horizontal positions depend only on the slot width, so they never move
 * between presentations, filters or selections.
 */
import type { NavEvent } from '../events'
import { formatWhen } from '../time'

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
export const STEM = 10
export const DATE_LINE = 24
export const LABEL_LINE = 20
export const IMG_GAP = 8
/** The subject's age at the event, under its date (biographies with a known birth year). */
export const AGE_LINE = 16
export const BLOCK_PAD = 8

/** Compact strip: a row of dates above the line, the line, a row below (15px dates on 18px lines). */
export const COMPACT = { axisY: 25, height: 50, stem: 5, dateLine: 18 }

export const above = (i: number) => i % 2 === 0

/**
 * One slot per date: events whose dates read the same ("2002", "26 August
 * 1983") share one point, one date and one age; their titles stack under
 * it, each still its own event (its own passage, its own edits). Only
 * identical displayed dates group ("1954" and "the fall of 1956" do not;
 * "1990" and "July 1990" do not). Events arrive in date order, so a date's
 * events are adjacent.
 */
export interface Slot {
  key: string
  events: NavEvent[]
  /** The photograph shown for the slot: the first event's that has one. */
  image: NavEvent['image']
}
export function slotsOf(events: NavEvent[], era = false): Slot[] {
  const out: Slot[] = []
  for (const e of events) {
    const key = formatWhen(e.date, era)
    const last = out[out.length - 1]
    if (last && last.key === key) last.events.push(e)
    else out.push({ key, events: [e], image: undefined })
  }
  for (const s of out) s.image = s.events.find((e) => e.image)?.image
  return out
}
/** Title lines a slot needs at this width: each title up to two lines, stacked; at most four. */
export function stackLines(slots: Slot[], blockW: number): number {
  const perLine = Math.max(8, Math.floor((blockW - 8) / 7))
  const need = (e: NavEvent) => Math.min(2, Math.max(1, Math.ceil(e.label.length / perLine)))
  if (!slots.length) return 1
  return Math.min(4, Math.max(1, ...slots.map((s) => s.events.reduce((n, e) => n + need(e), 0))))
}
/**
 * Title lines each side of the line needs: slots alternate above and below,
 * so each side reserves only what its own blocks use (one long title below
 * does not leave blank lines above).
 */
export function sideLines(slots: Slot[], blockW: number): [number, number] {
  return [stackLines(slots.filter((_, i) => above(i)), blockW), stackLines(slots.filter((_, i) => !above(i)), blockW)]
}
/** Lines each title gets in a slot of `count` titles when `lines` are available. */
export const linesPerTitle = (lines: number, count: number) => Math.max(1, Math.floor(lines / count))

/** How much of each block fits: label lines and image height, richest first. */
export interface Richness {
  lines: number
  imgH: number
}
const LADDER: Richness[] = [
  { lines: 4, imgH: 56 },
  { lines: 4, imgH: 48 },
  { lines: 3, imgH: 56 },
  { lines: 2, imgH: 52 },
  { lines: 2, imgH: 48 },
  { lines: 2, imgH: 40 },
  { lines: 2, imgH: 32 },
  { lines: 2, imgH: 0 },
  { lines: 1, imgH: 0 },
]
/** Editing: seeing the chosen photograph matters more than a second title line. */
const LADDER_IMAGES: Richness[] = [...LADDER.slice(0, 7), { lines: 1, imgH: 40 }, { lines: 1, imgH: 32 }, ...LADDER.slice(7)]
/** One small rectangular format (3:2), its height fitted to the panel. */
export const imgWidth = (imgH: number) => Math.round(imgH * 1.5)

export interface RichLayout extends Richness {
  /** Title lines per side (each at most `lines`). */
  linesAbove: number
  linesBelow: number
  aboveH: number
  belowH: number
  /** Height of the drawn track (without a scrollbar). */
  height: number
}
function sideH(r: Richness, lines: number, hasImg: boolean, age: number) {
  return STEM + DATE_LINE + age + lines * LABEL_LINE + (hasImg && r.imgH ? r.imgH + IMG_GAP : 0) + 2
}
/**
 * The richest blocks that fit `budget` px of track. Ages are left out, image
 * height gives way first, then label lines; text is never scaled down.
 */
export function richLayout(
  slots: Slot[],
  budget: number,
  maxLines: [number, number] = [3, 3],
  imagesFirst = false,
  ageLine = 0,
): RichLayout {
  const ladder = imagesFirst ? LADDER_IMAGES : LADDER
  const imgAbove = slots.some((s, i) => above(i) && s.image)
  const imgBelow = slots.some((s, i) => !above(i) && s.image)
  const make = (rr: Richness): RichLayout => {
    const linesAbove = Math.min(rr.lines, maxLines[0])
    const linesBelow = Math.min(rr.lines, maxLines[1])
    const r = { ...rr, lines: Math.max(linesAbove, linesBelow) }
    const aboveH = sideH(r, linesAbove, imgAbove, ageLine)
    const belowH = sideH(r, linesBelow, imgBelow, ageLine)
    return { ...r, linesAbove, linesBelow, aboveH, belowH, height: aboveH + belowH }
  }
  for (const r of ladder) {
    const l = make(r)
    if (l.height <= budget) return l
  }
  return make(ladder[ladder.length - 1])
}
