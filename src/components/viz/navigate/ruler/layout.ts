/**
 * Geometry of the one persistent ruler (B). The same marks are laid out in
 * two vertical geometries; their horizontal positions never change for a
 * given width, whatever the presentation, filter or selection.
 *
 *   expanded  label rows above the marks, roomy lanes for durations, tick labels
 *   compact   no label rows, lanes drawn together, the same axis and ticks
 *
 * Everything here is plain numbers so the component can animate explicit
 * geometry (height, translate) and opacity, never `transition: all`.
 */
import type { NavEvent } from '../events'
import { interval, midpoint } from '../time'

/** One motion value for every presentation change (Codex `--transition-timing-function-user` easing). */
export const MOTION_MS = 240

export const PAD_X = 12
export const LABEL_ROW = 20

export interface SceneLayout {
  compact: boolean
  labelRows: number
  /** Centre line of the point marks. */
  pointsY: number
  /** Centre of the first duration lane, and the distance between lanes. */
  rangeY0: number
  rangeStep: number
  barH: number
  axisY: number
  height: number
}

export function sceneLayout(compact: boolean, rangeRows: number, labelRows: number): SceneLayout {
  const extra = Math.max(0, rangeRows - 1)
  if (compact) {
    const pointsY = 7
    const rangeY0 = 15
    const rangeStep = 3
    const axisY = rangeY0 + extra * rangeStep + 6
    return { compact, labelRows: 0, pointsY, rangeY0, rangeStep, barH: 2, axisY, height: axisY + 17 }
  }
  const top = labelRows * LABEL_ROW
  const pointsY = top + (labelRows ? 24 : 14)
  const rangeY0 = pointsY + (labelRows ? 24 : 20)
  const rangeStep = 18
  const axisY = rangeY0 + extra * rangeStep + (labelRows ? 16 : 12)
  return { compact, labelRows, pointsY, rangeY0, rangeStep, barH: 5, axisY, height: axisY + 26 }
}

export const xAt = (y: number, domain: [number, number], width: number) =>
  PAD_X + ((y - domain[0]) / (domain[1] - domain[0] || 1)) * Math.max(1, width - 2 * PAD_X)
export const yearAtX = (px: number, domain: [number, number], width: number) =>
  domain[0] + Math.min(1, Math.max(0, (px - PAD_X) / Math.max(1, width - 2 * PAD_X))) * (domain[1] - domain[0])

export const isRange = (e: NavEvent) => !!e.date.end

export type PointMark = { kind: 'point'; key: string; e: NavEvent; x: number }
export type ClusterMark = { kind: 'cluster'; key: string; events: NavEvent[]; x: number; extent: [number, number] }
export type RangeMark = { key: string; e: NavEvent; x0: number; x1: number; row: number }

/**
 * Points closer than `minGap` share one count-bearing cluster (never spread
 * apart from their dates). `minGap` is the hit-target width, so targets never overlap.
 */
export function pointMarks(events: NavEvent[], domain: [number, number], width: number, minGap: number) {
  const pts = events
    .filter((e) => !isRange(e))
    .map((e) => ({ e, x: xAt(midpoint(e.date), domain, width) }))
    .sort((p, q) => p.x - q.x)
  const groups: { events: NavEvent[]; xs: number[] }[] = []
  for (const p of pts) {
    const last = groups[groups.length - 1]
    if (last && p.x - last.xs[last.xs.length - 1] < minGap) {
      last.events.push(p.e)
      last.xs.push(p.x)
    } else groups.push({ events: [p.e], xs: [p.x] })
  }
  return groups.map<PointMark | ClusterMark>((g) => {
    if (g.events.length === 1) return { kind: 'point', key: g.events[0].id, e: g.events[0], x: g.xs[0] }
    const iv = g.events.map((e) => interval(e.date))
    return {
      kind: 'cluster',
      key: g.events.map((e) => e.id).join('+'),
      events: g.events,
      x: (g.xs[0] + g.xs[g.xs.length - 1]) / 2,
      extent: [Math.min(...iv.map((i) => i[0])), Math.max(...iv.map((i) => i[1]))],
    }
  })
}

/** Durations and approximate ranges, packed into lanes so none overlap; positions stay exact. */
export function rangeMarks(events: NavEvent[], domain: [number, number], width: number): RangeMark[] {
  const ends: number[] = []
  return events
    .filter(isRange)
    .map((e) => {
      const [a, b] = interval(e.date)
      const x0 = xAt(a, domain, width)
      return { key: e.id, e, x0, x1: Math.max(xAt(b, domain, width), x0 + 4) }
    })
    .sort((p, q) => p.x0 - q.x0)
    .map((r) => {
      let row = ends.findIndex((end) => end + 6 <= r.x0)
      if (row === -1) {
        row = ends.length
        ends.push(r.x1)
      } else ends[row] = r.x1
      return { ...r, row }
    })
}

let canvas: HTMLCanvasElement | null = null
function textWidth(text: string, font: string) {
  canvas ??= document.createElement('canvas')
  const c = canvas.getContext('2d')!
  c.font = font
  return c.measureText(text).width
}

export interface PlacedLabel {
  e: NavEvent
  x: number
  row: number
  width: number
  align: 'start' | 'end'
}

/**
 * Direct labels for the editor's milestones, greedily placed in the label
 * rows; a label that does not fit is left out (the mark keeps its name for
 * hover, focus and assistive tech). The set depends only on the width, so
 * labels never rearrange when something is selected or filtered.
 */
export function placeLabels(
  items: { e: NavEvent; x: number; text: string }[],
  width: number,
  rows: number,
  font: string,
  maxW: number,
): PlacedLabel[] {
  const used: [number, number][][] = Array.from({ length: rows }, () => [])
  const out: PlacedLabel[] = []
  for (const it of [...items].sort((a, b) => a.x - b.x)) {
    const w = Math.min(maxW, Math.ceil(textWidth(it.text, font)) + 2)
    const align: 'start' | 'end' = it.x + w > width - 2 ? 'end' : 'start'
    const a = align === 'start' ? it.x - 3 : it.x - w + 3
    const ext: [number, number] = [a - 6, a + w + 6]
    if (ext[0] < -4) continue
    const row = used.findIndex((spans) => spans.every(([p, q]) => ext[1] <= p || ext[0] >= q))
    if (row === -1) continue
    used[row].push(ext)
    out.push({ e: it.e, x: it.x, row, width: w, align })
  }
  return out
}
