/**
 * Finding, revealing and highlighting a source passage in the rendered article.
 * Hover hints use the CSS Custom Highlight API (no DOM changes). The jump-to-
 * source mark is an overlay of line boxes over the sentence, because it has to
 * hold and then fade, which highlight pseudo-elements cannot animate.
 */
import { indexBlock, rangeFor } from './textIndex'
import type { SourceAnchor } from '../model/types'

export function mentionEl(root: HTMLElement, mentionId: string) {
  return root.querySelector<HTMLElement>(`[data-tl-id="${mentionId}"]`)
}

export function sentenceRange(
  root: HTMLElement,
  anchor: SourceAnchor,
  sourceText?: string,
): Range | null {
  const span = mentionEl(root, anchor.mentionId)
  const block = span?.closest<HTMLElement>('p, li')
  if (!block) return null
  const index = indexBlock(block)
  const slice = index.text.slice(anchor.sentenceStart, anchor.sentenceEnd)
  if (sourceText && slice !== sourceText) {
    // The paragraph changed (e.g. typed into in edit mode): find the sentence again.
    const at = index.text.indexOf(sourceText)
    if (at === -1) return rangeFor(index, 0, index.text.length)
    return rangeFor(index, at, at + sourceText.length)
  }
  return rangeFor(index, anchor.sentenceStart, anchor.sentenceEnd)
}

/** Vertical-only scroll (scrollIntoView would also nudge sideways on overflowing pages). */
export function scrollToEl(el: Element, where: 'center' | 'start' = 'center', offset = 0) {
  const r = el.getBoundingClientRect()
  const y =
    where === 'center'
      ? window.scrollY + r.top - (window.innerHeight - Math.min(r.height, window.innerHeight)) / 2
      : window.scrollY + r.top - offset
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' })
}

/** Open a collapsed Minerva section around `el`, if any. */
export function revealSection(el: HTMLElement) {
  const body = el.closest('.protowiki-mobile-section-body--collapsed')
  const heading = body?.previousElementSibling as HTMLElement | null
  if (heading?.matches('h2')) heading.click()
}

const supported = typeof CSS !== 'undefined' && 'highlights' in CSS
const timers = new Map<string, ReturnType<typeof setTimeout>>()

export function setHighlight(name: string, range: Range | null, ms = 0) {
  clearTimeout(timers.get(name))
  if (supported) {
    const registry = (CSS as any).highlights as Map<string, unknown>
    if (!range) registry.delete(name)
    else registry.set(name, new (window as any).Highlight(range))
  } else {
    document
      .querySelectorAll(`.tl-hl--${name}`)
      .forEach((el) => el.classList.remove(`tl-hl--${name}`))
    const block = range?.startContainer.parentElement?.closest('p, li')
    block?.classList.add(`tl-hl--${name}`)
  }
  if (range && ms)
    timers.set(
      name,
      setTimeout(() => setHighlight(name, null), ms),
    )
}

/**
 * Mark a range for a while: held clearly (--viz-highlight-hold), then a slow
 * fade (--viz-highlight-fade). One line box per line of text.
 */
let currentMark: HTMLElement | null = null
export function markRange(range: Range) {
  currentMark?.remove()
  const lines = new Map<number, { left: number; right: number; top: number; bottom: number }>()
  for (const r of Array.from(range.getClientRects())) {
    if (r.width < 1 || r.height < 1) continue
    const key = Math.round(r.top + r.height / 2)
    const near = [...lines.keys()].find((k) => Math.abs(k - key) < r.height / 2)
    const line = near !== undefined ? lines.get(near)! : undefined
    if (line) {
      line.left = Math.min(line.left, r.left)
      line.right = Math.max(line.right, r.right)
      line.top = Math.min(line.top, r.top)
      line.bottom = Math.max(line.bottom, r.bottom)
    } else lines.set(key, { left: r.left, right: r.right, top: r.top, bottom: r.bottom })
  }
  const mark = document.createElement('div')
  mark.className = 'viz tl-passage-mark'
  mark.setAttribute('aria-hidden', 'true')
  for (const l of lines.values()) {
    const box = document.createElement('div')
    box.className = 'tl-passage-mark__line'
    box.style.left = `${l.left + window.scrollX - 2}px`
    box.style.top = `${l.top + window.scrollY - 1}px`
    box.style.width = `${l.right - l.left + 4}px`
    box.style.height = `${l.bottom - l.top + 2}px`
    mark.appendChild(box)
  }
  mark.addEventListener('animationend', () => mark.remove())
  document.body.appendChild(mark)
  currentMark = mark
}

/** Scroll a passage into view and mark it. */
export function showPassage(root: HTMLElement, anchor: SourceAnchor, sourceText?: string) {
  const span = mentionEl(root, anchor.mentionId)
  if (!span) return false
  revealSection(span)
  // After a collapsed section opens, measure again.
  setTimeout(() => {
    scrollToEl(span, 'center')
    const range = sentenceRange(root, anchor, sourceText)
    if (range) markRange(range)
  }, 30)
  return true
}
