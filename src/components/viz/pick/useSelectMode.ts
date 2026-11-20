/**
 * Select mode: every candidate of the kind being picked becomes a tappable
 * chip, in place. Generic over what the candidates are — it only knows ids and
 * a kind (`data-kind` on each `.tl-mention`: "date" spans, "place" links).
 * The same chips, the same interaction, for a timeline or a map.
 */
import { watch, type Ref } from 'vue'

import { indexBlock, rangeFor } from './textIndex'
import { setHighlight } from './passage'

interface Options {
  root: Ref<HTMLElement | null>
  active: Ref<boolean>
  /** Which kind of mention is pickable now ("date", "place"). */
  kind: Ref<string | null>
  picked: Ref<Set<string>>
  /** Candidates whose thing is already on the result through another mention. */
  used?: Ref<Set<string>>
  describe: (id: string) => string
  toggle: (id: string) => void
  /** Sentence offsets for hover highlighting. */
  sentenceOf: (id: string) => { start: number; end: number } | null
}

export function useSelectMode(opts: Options) {
  const isCandidate = (el: Element) =>
    opts.active.value && !!opts.kind.value && (el as HTMLElement).dataset.kind === opts.kind.value

  function sync() {
    const root = opts.root.value
    if (!root) return
    root.querySelectorAll<HTMLElement>('.tl-mention').forEach((el) => {
      const id = el.dataset.tlId!
      const on = isCandidate(el)
      el.classList.toggle('tl-mention--candidate', on)
      el.classList.toggle('tl-mention--picked', on && opts.picked.value.has(id))
      el.classList.toggle(
        'tl-mention--used',
        on && !opts.picked.value.has(id) && !!opts.used?.value.has(id),
      )
      if (on) {
        if (el.tagName !== 'A') el.setAttribute('role', 'button')
        el.setAttribute('tabindex', '0')
        el.setAttribute('aria-pressed', String(opts.picked.value.has(id)))
        el.setAttribute('aria-label', opts.describe(id))
      } else {
        el.removeAttribute('role')
        if (el.tagName !== 'A') el.removeAttribute('tabindex')
        el.removeAttribute('aria-pressed')
        el.removeAttribute('aria-label')
      }
    })
  }

  function candidateFrom(target: EventTarget | null) {
    const root = opts.root.value
    const el = (target as Element | null)?.closest?.<HTMLElement>('.tl-mention')
    return el && root?.contains(el) && isCandidate(el) ? el : null
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
    [opts.root, opts.active, opts.kind, opts.picked, () => opts.used?.value],
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
