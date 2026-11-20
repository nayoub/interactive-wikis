/**
 * Pick, for tables: read a data table into a grid (merged cells expanded),
 * propose a role for each column from plain rules on header text and cell
 * content, and read party rows. No language model.
 *
 * Rules (each logged in notes/rule-failures.md when it misfires):
 *   - header rows: leading rows made only of <th>; a column's header is its
 *     headers top to bottom ("Party list › Seats"), merged cells repeated
 *   - category: the first mostly-text column (party names)
 *   - seats: whole numbers whose party rows sum to the chamber size
 *   - share: "%" in the header or in the cells (the first such column; others ignored)
 *   - votes: whole numbers in the thousands
 *   - change: signed numbers or a "+/–" header
 *   - colour: a narrow cell with an inline background colour (Template:Party color)
 *   - not a party: rows named Total, Valid, Invalid, Registered, Turnout, Source…
 */

import type { ColumnRole } from '../model/types'

export type { ColumnRole }

export interface ParsedTable {
  id: string
  el: HTMLTableElement
  sectionId: string
  sectionTitle: string
  caption: string
  /** Per column, the header path ("Party list › Seats"). */
  headers: string[]
  /** Body rows, cells expanded across merged columns. */
  rows: ParsedRow[]
}

export interface ParsedRow {
  el: HTMLTableRowElement
  /** Per column: the cell covering it (merged cells repeat). */
  cells: (HTMLTableCellElement | null)[]
  texts: string[]
  /** A background colour from a narrow colour cell, if the row has one. */
  color?: string
  /** Link target of the first link in the row's name cell ("Christian_Democratic_Union_of_Germany"). */
  linkTitle?: string
}

export interface RoleProposal {
  role: ColumnRole
  /** Why, in a few words, for the editor. */
  reason: string
}

const clean = (s: string | null | undefined) =>
  (s ?? '')
    .replace(/\[[^\]]*\]/g, '') // footnote markers [a], [12]
    .replace(/\s+/g, ' ')
    .trim()

/** Text of a cell without footnotes, hidden sort keys or styles. */
function cellText(cell: Element | null): string {
  if (!cell) return ''
  const copy = cell.cloneNode(true) as Element
  copy.querySelectorAll('sup, style, .sortkey, [style*="display:none"]').forEach((n) => n.remove())
  return clean(copy.textContent)
}

/** A number as the cell shows it: "11,196,374" → 11196374, "22.55" → 22.55, "–86" → -86. */
export function parseNumber(text: string): number | null {
  const t = text.replace(/[\s ]/g, '').replace(/[–—−]/g, '-').replace(/%$/, '')
  if (!/^[+-]?[\d,]*\.?\d+$/.test(t)) return null
  return Number(t.replace(/,/g, ''))
}

const BACKGROUND = /background(?:-color)?\s*:\s*(#[0-9a-f]{3,8}|rgb[^;]+)/i

export function parseTable(
  el: HTMLTableElement,
  id: string,
  sectionId: string,
  sectionTitle: string,
): ParsedTable {
  const grid: (HTMLTableCellElement | null)[][] = []
  Array.from(el.rows).forEach((tr, r) => {
    grid[r] ??= []
    let c = 0
    for (const cell of Array.from(tr.cells)) {
      while (grid[r][c]) c++
      const rs = Math.max(1, cell.rowSpan || 1)
      const cs = Math.max(1, cell.colSpan || 1)
      for (let dr = 0; dr < rs; dr++)
        for (let dc = 0; dc < cs; dc++) (grid[r + dr] ??= [])[c + dc] = cell
      c += cs
    }
  })
  const width = Math.max(0, ...grid.map((r) => r.length))
  const rows = Array.from(el.rows)

  // Header rows: leading rows of <th> only (a full-width title row counts too).
  let headerEnd = 0
  while (
    headerEnd < rows.length &&
    Array.from(rows[headerEnd].cells).every((c) => c.tagName === 'TH')
  )
    headerEnd++
  const headers = Array.from({ length: width }, (_, c) => {
    const parts: string[] = []
    for (let r = 0; r < headerEnd; r++) {
      const cell = grid[r]?.[c]
      if (!cell || (cell.colSpan || 1) >= width) continue // a title spanning the table
      const t = cellText(cell)
      if (t && parts[parts.length - 1] !== t) parts.push(t)
    }
    return parts.join(' › ')
  })

  const body: ParsedRow[] = rows.slice(headerEnd).map((tr, i) => {
    const cells = Array.from({ length: width }, (_, c) => grid[headerEnd + i]?.[c] ?? null)
    const texts = cells.map(cellText)
    const colorCell = cells.find(
      (cell) => cell && !cellText(cell) && BACKGROUND.test(cell.getAttribute('style') ?? ''),
    )
    const color = colorCell?.getAttribute('style')?.match(BACKGROUND)?.[1]
    const link = cells.map((cell) => cell?.querySelector('a[href^="./"]')).find(Boolean)
    const href = link?.getAttribute('href')
    let linkTitle: string | undefined
    if (href) {
      try {
        linkTitle = decodeURIComponent(href.slice(2).split('#')[0])
      } catch {
        linkTitle = href.slice(2).split('#')[0]
      }
    }
    return { el: tr, cells, texts, color, linkTitle }
  })

  const caption =
    clean(el.caption?.textContent) || (headerEnd ? cellText(grid[0]?.[0] ?? null) : '')
  return { id, el, sectionId, sectionTitle, caption, headers, rows: body }
}

const NOT_A_PARTY =
  /^(total|valid|invalid|blank|registered|turnout|electorate|source|abstention|votes cast|eligible)/i

/** Rows that look like parties: a name, at least one number, not a totals/turnout line. */
export function partyRows(t: ParsedTable, categoryCol: number): ParsedRow[] {
  return t.rows.filter((r) => {
    const name = r.texts[categoryCol]
    if (!name || NOT_A_PARTY.test(name)) return false
    // A row whose name cell spans the whole table is a separator or a source line.
    if ((r.cells[categoryCol]?.colSpan ?? 1) >= t.headers.length) return false
    return r.texts.some((x, c) => c !== categoryCol && parseNumber(x) !== null)
  })
}

/** Propose a role per column. `chamberSize` (from the infobox) identifies the seats column. */
export function proposeRoles(t: ParsedTable, chamberSize?: number): RoleProposal[] {
  const n = t.headers.length
  const out: RoleProposal[] = Array.from({ length: n }, () => ({
    role: 'ignore',
    reason: 'Nothing recognised',
  }))

  // Category: the column with the most text (names) in its own cells; leftmost on a tie.
  // (Cells merged across columns — "Total" spanning colour and name — count once, for the first.)
  let category = -1
  let best = 1
  for (let c = 0; c < n; c++) {
    const own = t.rows.filter((r) => r.cells[c] && r.cells[c] !== r.cells[c - 1])
    const names = own.filter((r) => r.texts[c] && parseNumber(r.texts[c]) === null).length
    if (names > best) {
      best = names
      category = c
    }
  }
  if (category === -1) return out
  out[category] = { role: 'category', reason: 'Mostly names' }
  const parties = partyRows(t, category)

  let shareSeen = false
  for (let c = 0; c < n; c++) {
    if (c === category) continue
    const header = t.headers[c]
    const raw = parties.map((r) => r.texts[c])
    const nums = raw.map(parseNumber).filter((v): v is number => v !== null)
    if (!raw.some(Boolean) || t.rows.every((r) => !r.texts[c])) {
      out[c] = { role: 'ignore', reason: t.rows.some((r) => r.color) ? 'Colour cells' : 'Empty' }
      continue
    }
    if (nums.length < parties.length * 0.5) {
      out[c] = { role: 'ignore', reason: 'Mostly text' }
      continue
    }
    const whole = nums.every((v) => Number.isInteger(v))
    const signed = raw.some((v) => /^[+–—−-]\s*\d/.test(v))
    const sum = nums.reduce((s, v) => s + v, 0)
    if (/\+\/?[–-]|±|change/i.test(header) || signed) {
      out[c] = { role: 'change', reason: 'Signed numbers' }
    } else if (/%|share/i.test(header) || raw.some((v) => /%$/.test(v))) {
      out[c] = shareSeen
        ? { role: 'ignore', reason: 'Another percentage column' }
        : { role: 'share', reason: 'Percentages' }
      shareSeen = true
    } else if (whole && chamberSize && sum === chamberSize) {
      out[c] = { role: 'seats', reason: `Whole numbers summing to ${chamberSize}` }
    } else if (whole && Math.max(...nums) >= 10_000) {
      out[c] = /vote/i.test(header)
        ? { role: 'votes', reason: 'Large whole numbers' }
        : { role: 'ignore', reason: 'Large whole numbers, header does not say votes' }
    } else if (whole) {
      out[c] = {
        role: 'ignore',
        reason: chamberSize
          ? `Whole numbers summing to ${sum}, not ${chamberSize}`
          : 'Small whole numbers',
      }
    }
  }
  // Only one column of each quantity: keep the first votes column.
  let votesSeen = false
  out.forEach((p, c) => {
    if (p.role !== 'votes') return
    if (votesSeen) out[c] = { role: 'ignore', reason: 'Another votes column' }
    votesSeen = true
  })
  return out
}

// ── Infobox: chamber size, majority, the article's own party order ─────────

export interface InfoboxElection {
  name: string
  date: string
  chamberSize?: number
  majority?: number
  /** Party link titles in the infobox's order, with the short name and seats won shown there. */
  order: { linkTitle: string; shortName: string; seats?: number }[]
}

export function readInfobox(body: ParentNode, name: string): InfoboxElection {
  const box = body.querySelector<HTMLTableElement>('table.infobox.ib-election, table.infobox')
  const text = clean(box?.textContent)
  const size = text.match(/All (\d[\d,]*) seats/)
  const majority = text.match(/(\d[\d,]*) seats needed for a majority/)
  const date = text.match(/\b(\d{1,2} [A-Z][a-z]+ \d{4})\b/)
  const order: InfoboxElection['order'] = []
  // Party rows: the infobox's "Party" row lists each party's link, left to right, block by
  // block; the block's "Seats won" row gives each one's seats, in the same columns.
  let block: InfoboxElection['order'] = []
  box?.querySelectorAll('tr').forEach((tr) => {
    const head = clean(tr.querySelector('th')?.textContent)
    if (/^Party$/i.test(head)) {
      block = []
      tr.querySelectorAll('td').forEach((td) => {
        const a = td.querySelector('a[href^="./"]')
        if (!a) return
        const linkTitle = decodeURIComponent((a.getAttribute('href') ?? '').slice(2).split('#')[0])
        if (order.some((o) => o.linkTitle === linkTitle)) return
        const entry = { linkTitle, shortName: clean(a.textContent) }
        order.push(entry)
        block.push(entry)
      })
    } else if (/^Seats won$/i.test(head)) {
      tr.querySelectorAll('td').forEach((td, i) => {
        const n = parseNumber(cellText(td))
        if (block[i] && n !== null) block[i].seats = n
      })
    }
  })
  return {
    name,
    date: date?.[1] ?? '',
    chamberSize: size ? Number(size[1].replace(/,/g, '')) : undefined,
    majority: majority ? Number(majority[1].replace(/,/g, '')) : undefined,
    order,
  }
}
