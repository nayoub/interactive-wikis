/**
 * The forms: everything that differs between them is here, one entry each,
 * beside its renderer. The frame, the curate panel and the host only ever
 * read these fields; none of them names a form.
 */
import { defineAsyncComponent, type Component } from 'vue'

import type { FormId, Item, Visual } from '../../model/visual'
import AnnotatedForm from './AnnotatedForm.vue'
import BarsForm from './BarsForm.vue'
import LineForm from './LineForm.vue'
import LinkedForm from './LinkedForm.vue'
import SeatsForm from './SeatsForm.vue'
import SmallColumnsForm from './SmallColumnsForm.vue'
import TimelineForm from './TimelineForm.vue'

export interface FormSetting {
  key: string
  label: string
  type: 'toggle'
  default: boolean
}

export interface FormDef {
  id: FormId
  /** In the form chooser. */
  label: string
  component: Component
  /** The frame's one-line "how to read it". */
  caption: (v: Visual) => string
  settings?: FormSetting[]
  /** The editor can put items in an order (categories); otherwise `order` orders them. */
  ordered?: boolean
  order?: (items: Item[]) => Item[]
  /** The figure numbers its items; the frame's list is numbered to match. */
  numbered?: boolean
  /** Can hold a second set (the Compare operator). */
  compare?: boolean
  /** A small preview of this form drawn from the editor's own items (SVG markup). */
  thumb: (items: Item[]) => string
}

const S = 'style="fill:var(--viz-strong)"'
const W = 'style="fill:var(--viz-weak)"'
const L = 'style="stroke:var(--viz-strong);fill:none;stroke-width:2"'
const R = 'style="stroke:var(--viz-rule);stroke-width:1"'
const svg = (body: string) =>
  `<svg viewBox="0 0 96 48" width="96" height="48" aria-hidden="true">${body}</svg>`
const qty = (i: Item) => i.components.quantity?.value ?? 0
const year = (i: Item) =>
  (i.components.time?.start.y ?? 0) * 100 + (i.components.time?.start.m ?? 0)
const byTime = (items: Item[]) => [...items].sort((a, b) => year(a) - year(b))
/** Points of a series, fitted to the thumbnail box. */
function fit(items: Item[]) {
  const s = byTime(items).filter((i) => i.components.quantity)
  const max = Math.max(1e-9, ...s.map(qty))
  return s.map((i, k) => ({
    x: 6 + (k / Math.max(1, s.length - 1)) * 84,
    y: 42 - (qty(i) / max) * 34,
  }))
}

const MapForm = defineAsyncComponent(() => import('./MapForm.vue'))

export const FORMS: Record<FormId, FormDef> = {
  timeline: {
    id: 'timeline',
    label: 'Timeline',
    component: TimelineForm,
    caption: () => 'Events in order of date; select one for its sentence in the article.',
    settings: [{ key: 'showGaps', label: 'Time between events', type: 'toggle', default: true }],
    order: byTime,
    thumb: (items) => {
      const n = Math.min(6, items.length)
      const dots = Array.from(
        { length: n },
        (_, k) => `<circle cx="${10 + (k * 76) / Math.max(1, n - 1)}" cy="24" r="3" ${S}/>`,
      )
      return svg(`<line x1="6" x2="90" y1="24" y2="24" ${R}/>${dots.join('')}`)
    },
  },
  map: {
    id: 'map',
    label: 'Map',
    component: MapForm,
    caption: (v) =>
      `Places named in the article${v.options.shadeByDate ? ', shaded by date' : ''}; select one for its sentence.`,
    settings: [{ key: 'shadeByDate', label: 'Shade by date', type: 'toggle', default: false }],
    thumb: (items) => {
      const pts = items.filter((i) => i.components.place).slice(0, 40)
      const lat = pts.map((i) => i.components.place!.lat)
      const lon = pts.map((i) => i.components.place!.lon)
      const [a, b, c, d] = [Math.min(...lat), Math.max(...lat), Math.min(...lon), Math.max(...lon)]
      const dots = pts.map(
        (i) =>
          `<circle cx="${8 + ((i.components.place!.lon - c) / (d - c || 1)) * 80}" cy="${40 - ((i.components.place!.lat - a) / (b - a || 1)) * 32}" r="2.5" ${S}/>`,
      )
      return svg(
        `<rect x="2" y="2" width="92" height="44" style="fill:var(--viz-land)"/>${dots.join('')}`,
      )
    },
  },
  linked: {
    id: 'linked',
    label: 'Map and timeline, linked',
    component: LinkedForm,
    caption: () =>
      'The same places on a map and in order of date; select one in either to light it in both.',
    settings: [{ key: 'showGaps', label: 'Time between events', type: 'toggle', default: true }],
    order: byTime,
    thumb: (items) => {
      const pts = items.filter((i) => i.components.place).slice(0, 12)
      const dots = pts.map(
        (_, k) =>
          `<circle cx="${8 + (k % 4) * 10}" cy="${12 + Math.floor(k / 4) * 10}" r="2.5" ${S}/>`,
      )
      const line = Array.from(
        { length: Math.min(5, pts.length) },
        (_, k) => `<circle cx="70" cy="${8 + k * 8}" r="2.5" ${S}/>`,
      )
      return svg(
        `<rect x="2" y="2" width="48" height="44" style="fill:var(--viz-land)"/>${dots.join('')}<line x1="70" x2="70" y1="4" y2="44" ${R}/>${line.join('')}`,
      )
    },
  },
  line: {
    id: 'line',
    label: 'Line',
    component: LineForm,
    caption: (v) =>
      `${v.sets[0]?.items[0]?.components.quantity?.measure ?? 'Values'} by year${v.sets.length > 1 ? `, ${v.sets.map((s) => s.label).join(' and ')}` : ''}; first, last and highest values labelled.`,
    order: byTime,
    compare: true,
    thumb: (items) =>
      svg(
        `<path d="${fit(items)
          .map((p, k) => `${k ? 'L' : 'M'}${p.x} ${p.y}`)
          .join('')}" ${L}/><line x1="4" x2="92" y1="43" y2="43" ${R}/>`,
      ),
  },
  columns: {
    id: 'columns',
    label: 'Columns',
    component: LineForm,
    caption: (v) =>
      `${v.sets[0]?.items[0]?.components.quantity?.measure ?? 'Values'} by year${v.sets.length > 1 ? `, ${v.sets.map((s) => s.label).join(' and ')}` : ''}; first, last and highest values labelled.`,
    settings: [],
    order: byTime,
    compare: true,
    thumb: (items) =>
      svg(
        fit(items)
          .map((p) => `<rect x="${p.x - 2}" y="${p.y}" width="4" height="${43 - p.y}" ${S}/>`)
          .join(''),
      ),
  },
  bars: {
    id: 'bars',
    label: 'Bars',
    component: BarsForm,
    caption: (v) =>
      `${v.sets[0]?.items[0]?.components.quantity?.measure ?? 'Values'} for each; select a bar for its row in the table.`,
    ordered: true,
    compare: true,
    thumb: (items) => {
      const s = items.slice(0, 5)
      const max = Math.max(1e-9, ...s.map(qty))
      return svg(
        s
          .map(
            (i, k) =>
              `<rect x="20" y="${6 + k * 8}" width="${(qty(i) / max) * 68}" height="5" ${S}/>`,
          )
          .join(''),
      )
    },
  },
  seats: {
    id: 'seats',
    label: 'Seat diagram',
    component: SeatsForm,
    caption: () => 'Each dot is a seat, in the order given; select a block for its row.',
    ordered: true,
    thumb: () =>
      svg(
        Array.from({ length: 30 }, (_, k) => {
          const a = Math.PI - (k % 15) * (Math.PI / 14)
          const r = k < 15 ? 30 : 20
          return `<circle cx="${48 + r * Math.cos(a)}" cy="${44 - r * Math.sin(a)}" r="2" ${k % 15 < 8 ? S : W}/>`
        }).join(''),
      ),
  },
  smallColumns: {
    id: 'smallColumns',
    label: 'Rows of small columns',
    component: SmallColumnsForm,
    caption: () =>
      'One row per measure, twelve months each on one axis; darker columns are above that row’s average.',
    thumb: (items) => {
      const rows = [...new Set(items.map((i) => i.components.category))].slice(0, 4)
      return svg(
        rows
          .map((c, r) => {
            const list = byTime(items.filter((i) => i.components.category === c)).slice(0, 12)
            const max = Math.max(1e-9, ...list.map((i) => Math.abs(qty(i))))
            const mean = list.reduce((s, i) => s + qty(i), 0) / (list.length || 1)
            return list
              .map((i, k) => {
                const hgt = (Math.abs(qty(i)) / max) * 9
                return `<rect x="${4 + k * 7.5}" y="${(r + 1) * 11 - hgt}" width="5" height="${hgt}" ${qty(i) > mean ? S : W}/>`
              })
              .join('')
          })
          .join(''),
      )
    },
  },
  annotated: {
    id: 'annotated',
    label: 'Annotated image',
    component: AnnotatedForm,
    caption: () => 'Numbered points on the image, listed below; select either to see the other.',
    numbered: true,
    thumb: (items) =>
      svg(
        `<rect x="2" y="2" width="92" height="44" style="fill:var(--viz-image-empty)"/>` +
          items
            .filter((i) => i.components.region)
            .slice(0, 6)
            .map(
              (i, k) =>
                `<circle cx="${2 + i.components.region!.x * 92}" cy="${2 + i.components.region!.y * 44}" r="5" ${S}/><text x="${2 + i.components.region!.x * 92}" y="${5 + i.components.region!.y * 44}" text-anchor="middle" style="fill:var(--viz-paper);font-size:8px">${k + 1}</text>`,
            )
            .join(''),
      ),
  },
}

/** Defaults for a form's settings. */
export const defaultsOf = (form: FormId) =>
  Object.fromEntries((FORMS[form].settings ?? []).map((s) => [s.key, s.default]))
