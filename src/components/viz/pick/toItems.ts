/**
 * What Pick finds, as general items (model/visual.ts). One converter per
 * source kind, none per form: a date mention gives a time, a place a place
 * (and a time when it has one), a table row times, categories and
 * quantities from the editor's column roles, an image marker a region.
 *
 * Table rules (logged in notes/rule-failures.md when they misfire):
 *   - time in the cells: years ("1842") → a column of times (a long table)
 *   - time in the header: months ("Jan") or years ("1981") across several
 *     columns, numbers in the cells → one time per column (a wide table, e.g.
 *     a climate table: rows are measures)
 *   - quantity: numbers; the first number in a cell ("25.1(77.2)" → 25.1, the
 *     °F in brackets is the same figure again)
 *   - ignore: an index column ("#"), change columns ("±%", "+82.0%"), and the
 *     "Year" aggregate of a wide table
 *   - unit: from the header or the row label (°C, mm, %, hours, days, km²)
 */
import type { DateMention, PlaceMention } from './types'
import type { ParsedTable } from './tables'
import type { EventImage } from '../model/types'
import type { Item, TimeComponent } from '../model/visual'

export function itemFromDate(m: DateMention): Item {
  return {
    id: m.id,
    label: m.draftLabel,
    components: { time: structuredClone(m.value) },
    source: { kind: 'sentence', anchor: { ...m.anchor }, text: m.sentence },
    citation: m.citation ? { ...m.citation } : undefined,
  }
}

export function itemFromPlace(m: PlaceMention): Item {
  const v = m.value
  const year = v.sentenceDate ? undefined : (v.opened ?? v.inception)
  const time: TimeComponent | undefined = v.sentenceDate
    ? structuredClone(v.sentenceDate)
    : year
      ? { start: { y: year }, precision: 'year' }
      : undefined
  return {
    id: m.id,
    label: /^Q\d+$/.test(v.name) ? m.text : m.draftLabel,
    components: { place: { ...v.coordinates }, ...(time ? { time } : {}) },
    source: { kind: 'sentence', anchor: { ...m.anchor }, text: m.sentence },
    citation: m.citation ? { ...m.citation } : undefined,
    wikidataId: v.wikidataId,
  }
}

// ── Tables ─────────────────────────────────────────────────────────────────

export type GeneralRole = 'time' | 'category' | 'quantity' | 'ignore'
export interface GeneralRoleProposal {
  role: GeneralRole
  reason: string
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** "1842" → 1842; "Jan"/"January" → month 1 of no year; anything else → null. */
export function parseTime(text: string): TimeComponent | null {
  const t = text.trim()
  const y = t.match(/^(1\d{3}|20\d{2})$/)
  if (y) return { start: { y: Number(y[1]) }, precision: 'year' }
  const m = MONTHS.indexOf(t.slice(0, 3).toLowerCase())
  if (m !== -1 && /^[A-Za-z]{3,9}\.?$/.test(t))
    return { start: { y: 0, m: m + 1 }, precision: 'month', recurring: true }
  return null
}

/** The first number in a cell: "25.1(77.2)" → 25.1, "15,963" → 15963, "−0.6" → -0.6. */
export function leadingNumber(text: string): number | null {
  const t = text.replace(/[\s ]/g, '').replace(/[–—−]/g, '-')
  const m = t.match(/^-?\d[\d,]*(\.\d+)?/)
  if (!m) return null
  return Number(m[0].replace(/,/g, ''))
}

const isChange = (header: string, cells: string[]) =>
  /±|\+\/?[–-]|change/i.test(header) ||
  cells.filter((c) => /^[+−–-]\s*\d.*%$/.test(c)).length > cells.length / 3

/** The unit in a label: "Record high °C (°F)" → "°C"; "Average precipitation mm (inches)" → "mm". */
export function unitOf(label: string): string {
  const m = label.match(/°C|°F|\bmm\b|\bcm\b|%|\bhours?\b|\bdays?\b|km2|km²|\binhabitants\b/i)
  if (!m) return ''
  const u = m[0].toLowerCase()
  return u === 'km2' ? 'km²' : u === 'hour' ? 'hours' : u === 'day' ? 'days' : m[0]
}
/** A measure's name without its unit: "Record high °C (°F)" → "Record high". */
export const measureOf = (label: string) =>
  label
    .replace(/\([^)]*\)/g, '')
    .replace(/°C|°F|\bmm\b|\binches\b|%/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Header abbreviations in Wikipedia's population tables: "Pop." → "Population". */
const ABBREVIATIONS: Record<string, string> = {
  pop: 'Population',
  'pop.': 'Population',
  inh: 'Inhabitants',
}
export const expandMeasure = (h: string) =>
  ABBREVIATIONS[h.trim().toLowerCase()] ?? (h.replace(/\.$/, '') || 'Value')

/** Propose a role per column of a table for the general tool. */
export function proposeGeneralRoles(t: ParsedTable): GeneralRoleProposal[] {
  const n = t.headers.length
  const out: GeneralRoleProposal[] = Array.from({ length: n }, () => ({
    role: 'ignore',
    reason: 'Nothing recognised',
  }))
  const cells = (c: number) => t.rows.map((r) => r.texts[c] ?? '').filter(Boolean)
  const lastHeader = (c: number) => t.headers[c].split(' › ').pop() ?? ''
  const headerTimes = t.headers.map((_, c) => parseTime(lastHeader(c)))
  const wide = headerTimes.filter(Boolean).length >= 3

  let category = -1
  let quantity = -1
  for (let c = 0; c < n; c++) {
    const cs = cells(c)
    if (!cs.length) {
      out[c] = { role: 'ignore', reason: 'Empty' }
      continue
    }
    const nums = cs.filter((x) => leadingNumber(x) !== null).length
    const times = cs.filter((x) => parseTime(x)).length
    if (/^#|^no\.?$/i.test(lastHeader(c))) out[c] = { role: 'ignore', reason: 'An index' }
    else if (wide && headerTimes[c] && nums >= cs.length / 2)
      out[c] = {
        role: 'time',
        reason: `A ${headerTimes[c]!.recurring ? 'month' : 'year'} in the header, numbers below`,
      }
    else if (wide && /^(year|annual|total)$/i.test(lastHeader(c)))
      out[c] = { role: 'ignore', reason: 'The whole year (a total of the others)' }
    else if (times >= cs.length * 0.6) out[c] = { role: 'time', reason: 'Years' }
    else if (isChange(t.headers[c], cs)) out[c] = { role: 'ignore', reason: 'Changes, not values' }
    else if (nums >= cs.length * 0.6) {
      // One quantity at a time in a long table (population, not area and density too).
      if (quantity === -1) {
        quantity = c
        out[c] = { role: 'quantity', reason: 'Numbers' }
      } else out[c] = { role: 'ignore', reason: 'Another number column' }
    } else if (category === -1) {
      category = c
      out[c] = { role: 'category', reason: 'Names' }
    } else out[c] = { role: 'ignore', reason: 'More text' }
  }
  return out
}

/** Rows that carry data: a number somewhere, not a Total/Source line, not a full-width note. */
function dataRows(t: ParsedTable, roles: GeneralRole[]) {
  const label = roles.indexOf('category')
  return t.rows.filter((r) => {
    const name = label >= 0 ? r.texts[label] : ''
    if (/^(total|source|sources|note|notes)\b/i.test(name)) return false
    if (label >= 0 && (r.cells[label]?.colSpan ?? 1) >= t.headers.length) return false
    return r.texts.some((x, c) => c !== label && roles[c] !== 'ignore' && leadingNumber(x) !== null)
  })
}

/**
 * A table's rows as items, from the editor's column roles.
 *   long (times in a column):   one item per row
 *   wide (times in the header): one item per row and time column
 */
export function itemsFromTable(t: ParsedTable, roles: GeneralRole[]): Item[] {
  const cat = roles.indexOf('category')
  const timeCols = roles.flatMap((r, c) => (r === 'time' ? [c] : []))
  const qtyCols = roles.flatMap((r, c) => (r === 'quantity' ? [c] : []))
  const last = (c: number) => t.headers[c].split(' › ').pop() ?? ''
  const headerTime = timeCols.map((c) => parseTime(last(c)))
  const wide = timeCols.length > 1 && headerTime.every(Boolean)
  const items: Item[] = []
  const rows = dataRows(t, roles)
  rows.forEach((row) => {
    const i = t.rows.indexOf(row)
    const rowId = row.el.dataset.tlId ?? `${t.id}-r${i}`
    const source = {
      kind: 'tableRow' as const,
      anchor: {
        sectionId: t.sectionId,
        sectionTitle: t.sectionTitle,
        mentionId: rowId,
        sentenceStart: 0,
        sentenceEnd: 0,
      },
      text: row.texts.filter(Boolean).join(' · '),
    }
    const rowLabel = cat >= 0 ? row.texts[cat] : ''
    if (wide) {
      timeCols.forEach((c, k) => {
        const value = leadingNumber(row.texts[c] ?? '')
        if (value === null) return
        const time = headerTime[k]!
        items.push({
          id: `${rowId}-c${c}`,
          label: `${measureOf(rowLabel) || rowLabel} · ${last(c)}`,
          components: {
            category: measureOf(rowLabel) || rowLabel,
            time,
            quantity: {
              value,
              unit: unitOf(rowLabel) || unitOf(t.caption),
              measure: measureOf(rowLabel) || rowLabel,
            },
          },
          source,
        })
      })
      return
    }
    const time = timeCols.length ? parseTime(row.texts[timeCols[0]] ?? '') : null
    qtyCols.forEach((c) => {
      const value = leadingNumber(row.texts[c] ?? '')
      if (value === null) return
      const measure = expandMeasure(last(c))
      items.push({
        id: qtyCols.length > 1 ? `${rowId}-c${c}` : rowId,
        label: rowLabel || (time ? String(time.start.y) : measure),
        components: {
          ...(time ? { time } : {}),
          ...(rowLabel ? { category: rowLabel } : {}),
          quantity: { value, unit: unitOf(t.headers[c]), measure },
        },
        source,
      })
    })
  })
  return items
}

/** A marker dropped on an image: a region item. */
export function itemFromMarker(image: EventImage, x: number, y: number, n: number): Item {
  return {
    id: `${image.id}-m${Date.now().toString(36)}${n}`,
    label: `Point ${n}`,
    components: { region: { imageId: image.id, x, y } },
    source: { kind: 'image', text: image.caption },
    image,
  }
}
