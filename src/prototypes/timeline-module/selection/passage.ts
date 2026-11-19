/**
 * Finding, revealing and highlighting a source passage in the rendered article.
 * Uses the CSS Custom Highlight API (no DOM changes); falls back to marking
 * the whole block where it is unavailable.
 */
import { indexBlock, rangeFor } from './textIndex'
import type { SourceAnchor } from '../timeline/types'

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

/** Scroll a passage into view and flash it. */
export function showPassage(root: HTMLElement, anchor: SourceAnchor, sourceText?: string) {
  const span = mentionEl(root, anchor.mentionId)
  if (!span) return false
  revealSection(span)
  scrollToEl(span, 'center')
  const range = sentenceRange(root, anchor, sourceText)
  setHighlight('tl-source', range, 3200)
  const block = span.closest('p, li')
  block?.classList.remove('tl-flash')
  void (block as HTMLElement | null)?.offsetWidth
  block?.classList.add('tl-flash')
  return true
}
