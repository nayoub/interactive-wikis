/**
 * The reading anchor: the sourced passage the reader is passing through,
 * found by position in article order at a reading line (a third of the way
 * down the article area below the sticky ruler). Not the largest date seen:
 * it moves backwards in time when the article does.
 *
 *   at      the reading line is inside the block of a dated passage
 *   after   past the last dated passage (its date is kept; the wording says "After")
 *   before  no dated passage yet: the introduction or the section, no invented date
 *
 * It is only recomputed when the caller says so (genuine scrolling or
 * navigation), never because the panel changed size. The block being read
 * gets a quiet tick in the gutter at the line of its date.
 */
import { onBeforeUnmount, ref, type Ref } from 'vue'

import type { NavEvent } from '../events'

export interface Reading {
  id: string | null
  state: 'at' | 'after' | 'before'
  /** The section at the reading line ("Introduction" for the lead). */
  section: string
}

const BLOCK = 'p, li, dd, td, th, blockquote, figcaption'

function sectionAt(body: HTMLElement, y: number): string {
  let title = 'Introduction'
  for (const h of body.querySelectorAll<HTMLElement>('h2')) {
    if (!h.getClientRects().length || h.closest('.tn-mount')) continue
    if (h.getBoundingClientRect().top > y) break
    title = h.textContent?.trim() || title
  }
  return title
}

export function useReading(opts: {
  body: () => HTMLElement | null
  events: () => NavEvent[]
  resolve: (e: NavEvent) => HTMLElement | null
  /**
   * Where reading in time begins: passages before this element (the introduction,
   * above the timeline) never become the reading anchor while scrolling. An
   * introduction summarises out of order, so the timeline starts at its beginning.
   */
  startAfter?: () => Element | null
}) {
  const reading: Ref<Reading> = ref({ id: null, state: 'before', section: 'Introduction' })
  let ticked: HTMLElement | null = null

  function tick(block: HTMLElement | null, mention: HTMLElement | null) {
    if (ticked && ticked !== block) ticked.classList.remove('tn-reading-tick')
    ticked = block
    if (!block || !mention) return
    block.classList.add('tn-reading-tick')
    const top = mention.getBoundingClientRect().top - block.getBoundingClientRect().top
    block.style.setProperty('--tn-tick-top', `${Math.max(0, Math.round(top))}px`)
  }

  /** `lineY`: the reading line in viewport coordinates. */
  function update(lineY: number) {
    const body = opts.body()
    if (!body) return
    const ordered = [...opts.events()].sort((a, b) => a.order - b.order)
    let last: { e: NavEvent; el: HTMLElement } | null = null
    for (const e of ordered) {
      const el = opts.resolve(e)
      // A passage in a closed section has no boxes: it cannot be the one being read.
      if (!el || !el.getClientRects().length) continue
      const start = opts.startAfter?.()
      if (start && start.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) continue
      if (el.getBoundingClientRect().top <= lineY) last = { e, el }
      else break
    }
    const section = sectionAt(body, lineY)
    if (!last) {
      tick(null, null)
      reading.value = { id: null, state: 'before', section }
      return
    }
    const block = last.el.closest<HTMLElement>(BLOCK) ?? last.el
    const inside = block.getBoundingClientRect().bottom >= lineY
    tick(inside ? block : null, inside ? last.el : null)
    const next: Reading = { id: last.e.id, state: inside ? 'at' : 'after', section }
    const cur = reading.value
    if (cur.id !== next.id || cur.state !== next.state || cur.section !== next.section) reading.value = next
  }

  /** After a deliberate jump: the passage it landed on is the one being read. */
  function set(id: string) {
    const e = opts.events().find((v) => v.id === id)
    const el = e ? opts.resolve(e) : null
    const body = opts.body()
    if (!e || !el || !body) return
    const block = el.closest<HTMLElement>(BLOCK) ?? el
    tick(block, el)
    reading.value = { id, state: 'at', section: sectionAt(body, el.getBoundingClientRect().top) }
  }

  onBeforeUnmount(() => tick(null, null))
  return { reading, update, set }
}
