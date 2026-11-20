/**
 * The label span in the text: the words the label is made of, underlined in
 * their sentence (in a style distinct from the chips), with an end to drag at
 * each side. On a phone, tap a word just outside the span to take it in, or
 * the first or last word to let it go. Keyboard: Shift+→ / Shift+← move the
 * end by a word; Alt+Shift+→ / Alt+Shift+← move the start.
 */
import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'

import type { Item } from '../model/visual'
import { words, type Span } from '../pick/labelSpan'
import { indexBlock, rangeFor } from '../pick/textIndex'

interface Options {
  root: Ref<HTMLElement | null>
  /** The item whose span is shown (null: none). */
  item: Ref<Item | null>
  active: Ref<boolean>
  /** Before a change (for undo). */
  begin: () => void
  change: (span: Span) => void
}

export function useSpanEditor(o: Options) {
  let layer: HTMLDivElement | null = null
  let ro: ResizeObserver | null = null

  /** The sentence in the DOM: its block, and its words with their ranges. */
  function locate() {
    const item = o.item.value
    const root = o.root.value
    const a = item?.source.anchor
    if (!item || !root || !a || item.source.kind !== 'sentence' || !item.source.span) return null
    const mention = root.querySelector<HTMLElement>(`[data-tl-id="${a.mentionId}"]`)
    const block = mention?.closest<HTMLElement>('p, li')
    if (!block) return null
    const index = indexBlock(block)
    const s = item.source.text
    const base =
      index.text.slice(a.sentenceStart, a.sentenceStart + s.length) === s
        ? a.sentenceStart
        : index.text.indexOf(s)
    if (base < 0) return null
    const ws = words(s).map((w) => ({ ...w, range: rangeFor(index, base + w.start, base + w.end) }))
    return { item, block, ws, span: item.source.span }
  }

  function clear() {
    layer?.remove()
    layer = null
  }

  function render() {
    clear()
    if (!o.active.value) return
    const at = locate()
    if (!at) return
    // A word is in the span when it starts inside it (words carry their punctuation: "Biscay,").
    const inSpan = at.ws.filter((w) => w.start >= at.span.start && w.start < at.span.end && w.range)
    if (!inSpan.length) return
    // One underline per line of the span.
    const lines: { left: number; right: number; bottom: number }[] = []
    for (const w of inSpan) {
      for (const r of Array.from(w.range!.getClientRects())) {
        const line = lines.find((l) => Math.abs(l.bottom - r.bottom) < r.height / 2)
        if (line) {
          line.left = Math.min(line.left, r.left)
          line.right = Math.max(line.right, r.right)
        } else lines.push({ left: r.left, right: r.right, bottom: r.bottom })
      }
    }
    lines.sort((x, y) => x.bottom - y.bottom || x.left - y.left)
    layer = document.createElement('div')
    layer.className = 'gm-span'
    layer.setAttribute('aria-hidden', 'false')
    const sx = window.scrollX
    const sy = window.scrollY
    for (const l of lines) {
      const bar = document.createElement('div')
      bar.className = 'gm-span__line'
      Object.assign(bar.style, {
        left: `${l.left + sx}px`,
        top: `${l.bottom + sy}px`,
        width: `${l.right - l.left}px`,
      })
      layer.appendChild(bar)
    }
    const first = lines[0]
    const last = lines[lines.length - 1]
    layer.appendChild(handle('start', first.left + sx, first.bottom + sy))
    layer.appendChild(handle('end', last.right + sx, last.bottom + sy))
    document.body.appendChild(layer)
  }

  function handle(side: 'start' | 'end', x: number, y: number) {
    const h = document.createElement('button')
    h.type = 'button'
    h.className = `gm-span__handle gm-span__handle--${side}`
    h.setAttribute(
      'aria-label',
      side === 'start'
        ? 'Start of the label: drag, or use Alt+Shift+arrows'
        : 'End of the label: drag, or use Shift+arrows',
    )
    Object.assign(h.style, { left: `${x}px`, top: `${y}px` })
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      o.begin()
      try {
        h.setPointerCapture(e.pointerId)
      } catch {
        /* a synthetic pointer: no capture */
      }
      const move = (ev: PointerEvent) => dragTo(side, ev.clientX, ev.clientY)
      const up = () => {
        h.removeEventListener('pointermove', move)
        h.removeEventListener('pointerup', up)
        h.removeEventListener('pointercancel', up)
      }
      h.addEventListener('pointermove', move)
      h.addEventListener('pointerup', up)
      h.addEventListener('pointercancel', up)
    })
    return h
  }

  /** The word nearest a point (same line first). */
  function nearest(ws: NonNullable<ReturnType<typeof locate>>['ws'], x: number, y: number) {
    let best = ws[0]
    let d = Infinity
    for (const w of ws) {
      for (const r of Array.from(w.range?.getClientRects() ?? [])) {
        const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
        const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
        const dd = dx + dy * 4
        if (dd < d) {
          d = dd
          best = w
        }
      }
    }
    return best
  }

  function dragTo(side: 'start' | 'end', x: number, y: number) {
    const at = locate()
    if (!at) return
    const w = nearest(at.ws, x, y)
    if (side === 'start' && w.start < at.span.end) o.change({ start: w.start, end: at.span.end })
    if (side === 'end' && w.end > at.span.start) o.change({ start: at.span.start, end: w.end })
  }

  /** Phone (and desktop): tap a word at the edge to take it in or let it go. */
  function onClick(e: MouseEvent) {
    if (!o.active.value) return
    const at = locate()
    const t = e.target as HTMLElement
    if (!at || !at.block.contains(t) || t.closest('.tl-mention--candidate, a')) return
    const w = nearest(at.ws, e.clientX, e.clientY)
    const i = at.ws.indexOf(w)
    const firstIn = at.ws.findIndex((x) => x.start >= at.span.start)
    const lastIn = at.ws.length - 1 - [...at.ws].reverse().findIndex((x) => x.start < at.span.end)
    let next: Span | null = null
    if (i === firstIn - 1) next = { start: w.start, end: at.span.end }
    else if (i === lastIn + 1) next = { start: at.span.start, end: w.end }
    else if (i === firstIn && lastIn > firstIn)
      next = { start: at.ws[i + 1].start, end: at.span.end }
    else if (i === lastIn && lastIn > firstIn)
      next = { start: at.span.start, end: at.ws[i - 1].end }
    if (!next) return
    e.preventDefault()
    o.begin()
    o.change(next)
  }

  function onKey(e: KeyboardEvent) {
    if (!o.active.value || !e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    const t = e.target as HTMLElement
    if (t.closest('input, textarea, [contenteditable="true"]')) return
    const at = locate()
    if (!at) return
    const firstIn = at.ws.findIndex((x) => x.start >= at.span.start)
    const lastIn = at.ws.length - 1 - [...at.ws].reverse().findIndex((x) => x.start < at.span.end)
    const dir = e.key === 'ArrowRight' ? 1 : -1
    let next: Span | null = null
    if (e.altKey) {
      const k = firstIn + dir
      if (k >= 0 && k <= lastIn) next = { start: at.ws[k].start, end: at.span.end }
    } else {
      const k = lastIn + dir
      if (k >= firstIn && k < at.ws.length) next = { start: at.span.start, end: at.ws[k].end }
    }
    if (!next) return
    e.preventDefault()
    o.begin()
    o.change(next)
  }

  onMounted(() => {
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', render)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('resize', render)
    ro?.disconnect()
    clear()
  })
  watch(
    o.root,
    (el, old) => {
      old?.removeEventListener('click', onClick)
      el?.addEventListener('click', onClick)
      ro?.disconnect()
      if (el) {
        // The block growing above the text moves the words: follow them.
        ro = new ResizeObserver(() => requestAnimationFrame(render))
        ro.observe(el)
      }
    },
    { immediate: true },
  )
  watch(
    [
      o.active,
      () => o.item.value?.id,
      () => o.item.value?.source.span?.start,
      () => o.item.value?.source.span?.end,
    ],
    () => requestAnimationFrame(render),
  )
  return { render }
}
