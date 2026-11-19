/**
 * Select mode: every candidate in the article becomes a tappable chip, in
 * place. Generic over what the candidates are — it only knows ids. Dates
 * today; the same interaction should work for places next.
 */
import { watch, type Ref } from 'vue'

import { indexBlock, rangeFor } from './textIndex'
import { setHighlight } from './passage'

interface Options {
  root: Ref<HTMLElement | null>
  active: Ref<boolean>
  picked: Ref<Set<string>>
  /** Selector for candidates; each carries its id in `data-tl-id`. */
  selector?: string
  describe: (id: string) => string
  toggle: (id: string) => void
  /** Sentence offsets for hover highlighting. */
  sentenceOf: (id: string) => { start: number; end: number } | null
}

export function useSelectMode(opts: Options) {
  const selector = opts.selector ?? '[data-tl-id]'

  function sync() {
    const root = opts.root.value
    if (!root) return
    root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      const id = el.dataset.tlId!
      const on = opts.active.value
      el.classList.toggle('tl-mention--picked', on && opts.picked.value.has(id))
      if (on) {
        el.setAttribute('role', 'button')
        el.setAttribute('tabindex', '0')
        el.setAttribute('aria-pressed', String(opts.picked.value.has(id)))
        el.setAttribute('aria-label', opts.describe(id))
      } else {
        el.removeAttribute('role')
        el.removeAttribute('tabindex')
        el.removeAttribute('aria-pressed')
        el.removeAttribute('aria-label')
      }
    })
  }

  function candidateFrom(target: EventTarget | null) {
    const root = opts.root.value
    const el = (target as Element | null)?.closest?.<HTMLElement>(selector)
    return el && root?.contains(el) ? el : null
  }

  function onClick(e: MouseEvent) {
    if (!opts.active.value) return
    // Nothing in the article navigates while picking.
    if ((e.target as Element).closest('a')) e.preventDefault()
    const el = candidateFrom(e.target)
    if (!el) return
    e.preventDefault()
    e.stopPropagation()
    opts.toggle(el.dataset.tlId!)
    el.classList.remove('tl-mention--pop')
    void el.offsetWidth
    el.classList.add('tl-mention--pop')
    hover(el)
  }

  function onKeydown(e: KeyboardEvent) {
    if (!opts.active.value || (e.key !== 'Enter' && e.key !== ' ')) return
    const el = candidateFrom(e.target)
    if (!el) return
    e.preventDefault()
    opts.toggle(el.dataset.tlId!)
  }

  function hover(el: HTMLElement | null) {
    if (!el || !opts.active.value) return setHighlight('tl-hover', null)
    const s = opts.sentenceOf(el.dataset.tlId!)
    const block = el.closest<HTMLElement>('p, li')
    if (!s || !block) return
    setHighlight('tl-hover', rangeFor(indexBlock(block), s.start, s.end))
  }
  function onOver(e: MouseEvent) {
    hover(candidateFrom(e.target))
  }
  function onFocusIn(e: FocusEvent) {
    hover(candidateFrom(e.target))
  }

  watch(
    [opts.root, opts.active, opts.picked],
    ([root], _old, onCleanup) => {
      sync()
      if (!root || !opts.active.value) {
        setHighlight('tl-hover', null)
        return
      }
      root.addEventListener('click', onClick, true)
      root.addEventListener('keydown', onKeydown)
      root.addEventListener('mouseover', onOver)
      root.addEventListener('focusin', onFocusIn)
      onCleanup(() => {
        root.removeEventListener('click', onClick, true)
        root.removeEventListener('keydown', onKeydown)
        root.removeEventListener('mouseover', onOver)
        root.removeEventListener('focusin', onFocusIn)
      })
    },
    { flush: 'post', deep: true },
  )

  return { sync }
}
