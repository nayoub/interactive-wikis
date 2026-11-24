/**
 * The navigation contract every variant shares. Four separate states:
 *
 *   selectedId  the event the reader chose (navigator state; also in the URL)
 *   inView      indexed source passages currently on screen (may be several, or none)
 *   range       the period the navigator is narrowed to (navigator only)
 *   origin      where reading was when the first jump happened
 *
 * Only `jump` and `returnToOrigin` move the article. Selecting a period,
 * expanding a group or opening a cluster never does. Passive scrolling only
 * updates `inView`; it never jumps, never selects and never adds history.
 */
import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue'

import { revealSection, sentenceRange } from '../pick/passage'
import type { NavEvent } from './events'
import { formatWhen } from './time'

export interface Origin {
  /** The block that was at the top of the reading area, and how far below the top it sat. */
  el: HTMLElement | null
  offset: number
  scrollY: number
  /** "Early life": for the Return button's description. */
  section: string
}

/** The reader's setting, or `?motion=reduce` (sets `data-tn-motion` on the page) to check it. */
const reducedMotion = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.documentElement.dataset.tnMotion === 'reduce')
const behavior = (): ScrollBehavior => (reducedMotion() ? 'auto' : 'smooth')
/** One layout pass (or a short wait where frames are throttled, as in a background tab). */
const frame = () =>
  new Promise<void>((r) => {
    let done = false
    const go = () => {
      if (done) return
      done = true
      r()
    }
    requestAnimationFrame(go)
    setTimeout(go, 50)
  })

const highlights = typeof CSS !== 'undefined' && 'highlights' in CSS
function setHighlight(name: string, range: Range | null) {
  if (!highlights) return
  const registry = (CSS as unknown as { highlights: Map<string, unknown> }).highlights
  if (!range) registry.delete(name)
  else registry.set(name, new (window as unknown as { Highlight: new (r: Range) => unknown }).Highlight(range))
}

/** Space taken by sticky or fixed things at the top and bottom of the viewport. */
export function obstructions(): { top: number; bottom: number } {
  let top = 0
  let bottom = 0
  document.querySelectorAll<HTMLElement>('header, [data-tn-obstruct]').forEach((el) => {
    const cs = getComputedStyle(el)
    if (cs.position !== 'fixed' && cs.position !== 'sticky') return
    if (cs.display === 'none' || cs.visibility === 'hidden') return
    const r = el.getBoundingClientRect()
    if (!r.height) return
    if (el.dataset.tnObstruct === 'bottom') {
      bottom = Math.max(bottom, window.innerHeight - r.top)
      return
    }
    // Our own sticky frames obstruct once stuck, wherever they are now.
    if (el.dataset.tnObstruct === 'top') {
      top = Math.max(top, (parseFloat(cs.top) || 0) + r.height)
      return
    }
    if (r.top <= 1 && r.bottom > 0) top = Math.max(top, r.bottom)
  })
  return { top, bottom }
}

const BLOCKS = 'p, li, h2, h3, h4, figure, table, dd, blockquote'

export function createNavigator(opts: {
  body: Ref<HTMLElement | null>
  events: Ref<NavEvent[]>
}) {
  const { body, events } = opts
  const selectedId = ref<string | null>(null)
  const inView = ref<string[]>([])
  const range = ref<[number, number] | null>(null)
  const origin = shallowRef<Origin | null>(null)
  /** The last event whose passage could not be found (cleared on the next jump). */
  const unresolved = ref<string | null>(null)
  /** Polite announcement for screen readers. */
  const announcement = ref('')
  /** True while a jump's own scroll is running (so variants do not read it as the reader moving). */
  const jumping = ref(false)
  /** Bumped on every successful jump. */
  const jumps = ref(0)

  const byId = computed(() => new Map(events.value.map((e) => [e.id, e])))
  const selected = computed(() => (selectedId.value ? (byId.value.get(selectedId.value) ?? null) : null))

  function announce(text: string) {
    announcement.value = ''
    requestAnimationFrame(() => (announcement.value = text))
  }

  /** The mention for an event, found fresh each time (the article DOM changes). */
  function resolve(e: NavEvent): HTMLElement | null {
    const root = body.value
    if (!root) return null
    return root.querySelector<HTMLElement>(`[data-tl-id="${CSS.escape(e.sourceAnchor.mentionId)}"]`)
  }

  // ── Selected passage, marked in place without changing any text colour ──
  let markedBlock: HTMLElement | null = null
  function markBlock(block: HTMLElement | null) {
    markedBlock?.classList.remove('tn-passage--selected')
    markedBlock = block
    block?.classList.add('tn-passage--selected')
  }
  let flashTimers: ReturnType<typeof setTimeout>[] = []
  function flash(r: Range | null, name = 'tn-flash') {
    flashTimers.forEach(clearTimeout)
    flashTimers = []
    setHighlight('tn-flash', null)
    setHighlight('tn-flash-fade', null)
    setHighlight('tn-origin', null)
    if (!r) return
    setHighlight(name, r)
    if (name === 'tn-flash' && !reducedMotion()) {
      flashTimers.push(
        setTimeout(() => {
          setHighlight('tn-flash', null)
          setHighlight('tn-flash-fade', r)
        }, 2200),
      )
    }
    flashTimers.push(
      setTimeout(() => {
        setHighlight(name, null)
        setHighlight('tn-flash-fade', null)
      }, 3200),
    )
  }

  function scrollTargetTo(rect: DOMRect, at = 0.25) {
    const { top, bottom } = obstructions()
    // Leave room for a bottom bar that may appear after this jump.
    const reserve = Math.max(bottom, 72)
    const free = window.innerHeight - top - reserve
    const lead = rect.height > free * 0.6 ? 16 : Math.max(24, free * at)
    const y = window.scrollY + rect.top - top - lead
    window.scrollTo({ top: Math.max(0, y), behavior: behavior() })
  }

  function captureOrigin(): Origin {
    const { top } = obstructions()
    const root = body.value
    let el: HTMLElement | null = null
    if (root) {
      for (const b of root.querySelectorAll<HTMLElement>(BLOCKS)) {
        if (b.closest('.tn-mount')) continue
        const r = b.getBoundingClientRect()
        if (!r.height) continue
        if (r.bottom > top + 8) {
          el = b
          break
        }
      }
    }
    const offset = el ? el.getBoundingClientRect().top - top : 0
    const section =
      el?.closest('section')?.querySelector(':scope > h2, :scope > h3, :scope > h4')?.textContent?.trim() ||
      'the introduction'
    return { el, offset, scrollY: window.scrollY, section }
  }

  let settle: ReturnType<typeof setTimeout> | null = null
  function whileScrolling() {
    jumping.value = true
    if (settle) clearTimeout(settle)
    const done = () => {
      jumping.value = false
      window.removeEventListener('scrollend', done)
    }
    window.addEventListener('scrollend', done, { once: true })
    settle = setTimeout(done, reducedMotion() ? 150 : 1200)
  }

  /**
   * Deliberate passage navigation. Saves the reading origin on the first
   * jump of an exploration, opens a collapsed section, reveals the sentence
   * below any sticky controls, marks it briefly and moves focus to it.
   */
  async function jump(
    e: NavEvent,
    how: { keepOrigin?: boolean; /** Leave focus where it is (stepping controls). */ keepFocus?: boolean } = {},
  ): Promise<boolean> {
    const el = resolve(e)
    if (!el) {
      unresolved.value = e.id
      announce(
        `The passage for “${e.label}” (${formatWhen(e.date)}) could not be found in this revision of the article.`,
      )
      return false
    }
    unresolved.value = null
    if (!origin.value && !how.keepOrigin) origin.value = captureOrigin()
    selectedId.value = e.id
    revealSection(el)
    // Let an opened section lay out before measuring.
    await frame()
    await frame()
    const root = body.value!
    const r = sentenceRange(root, e.sourceAnchor, e.sourceText || undefined)
    const block = el.closest<HTMLElement>('p, li, td, th, dd') ?? el
    whileScrolling()
    scrollTargetTo((r ?? block).getBoundingClientRect() as DOMRect)
    markBlock(block)
    flash(r)
    if (!how.keepFocus) {
      if (!block.hasAttribute('tabindex')) block.setAttribute('tabindex', '-1')
      block.focus({ preventScroll: true })
    }
    jumps.value++
    announce(`${formatWhen(e.date)}: ${e.label}. In “${e.sourceAnchor.sectionTitle}”.`)
    return true
  }

  /** Back to where reading was before the first jump; ends the exploration. */
  async function returnToOrigin() {
    const o = origin.value
    if (!o) return
    origin.value = null
    let y = o.scrollY
    if (o.el?.isConnected) {
      revealSection(o.el)
      await frame()
      const { top } = obstructions()
      const r = o.el.getBoundingClientRect()
      if (r.height) y = window.scrollY + r.top - top - o.offset
    }
    whileScrolling()
    window.scrollTo({ top: Math.max(0, y), behavior: behavior() })
    if (o.el?.isConnected) {
      const r = document.createRange()
      r.selectNodeContents(o.el)
      flash(r, 'tn-origin')
      if (!o.el.hasAttribute('tabindex')) o.el.setAttribute('tabindex', '-1')
      o.el.focus({ preventScroll: true })
    }
    announce(`Returned to where you were reading, in ${o.section}.`)
  }

  /** Keep reading here: forget the origin; the next jump saves a new one. */
  function endExploration() {
    origin.value = null
    announce('Reading position kept. The next event you open starts a new exploration.')
  }

  // ── Passages in view (passive) ─────────────────────────────────────────
  let io: IntersectionObserver | null = null
  let mo: MutationObserver | null = null
  const visible = new Set<string>()
  const elToIds = new Map<Element, string[]>()
  function observe() {
    io?.disconnect()
    visible.clear()
    elToIds.clear()
    const root = body.value
    if (!root) {
      inView.value = []
      return
    }
    const { top, bottom } = obstructions()
    io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          for (const id of elToIds.get(en.target) ?? []) {
            if (en.isIntersecting) visible.add(id)
            else visible.delete(id)
          }
        }
        const next = events.value.filter((e) => visible.has(e.id)).map((e) => e.id)
        if (next.join() !== inView.value.join()) inView.value = next
      },
      { rootMargin: `-${Math.round(top)}px 0px -${Math.round(Math.max(bottom, 0))}px 0px` },
    )
    for (const e of events.value) {
      const el = resolve(e)
      if (!el) continue
      elToIds.set(el, [...(elToIds.get(el) ?? []), e.id])
      io.observe(el)
    }
  }
  let pending: ReturnType<typeof setTimeout> | null = null
  const reobserve = () => {
    if (pending) clearTimeout(pending)
    pending = setTimeout(observe, 120)
  }
  watch(
    [body, events],
    ([el]) => {
      mo?.disconnect()
      reobserve()
      if (!el) return
      // Minerva's accordion and mounts move nodes after render: observe again when they do.
      mo = new MutationObserver((records) => {
        if (records.some((r) => r.type === 'childList' && ![...r.addedNodes, ...r.removedNodes].every((n) => n instanceof HTMLElement && n.closest?.('.tn-mount'))))
          reobserve()
      })
      mo.observe(el, { childList: true, subtree: true })
    },
    { immediate: true },
  )
  const onResize = () => reobserve()
  window.addEventListener('resize', onResize)
  onBeforeUnmount(() => {
    io?.disconnect()
    mo?.disconnect()
    window.removeEventListener('resize', onResize)
    markBlock(null)
    flash(null)
  })

  return {
    selectedId,
    selected,
    inView,
    range,
    origin,
    unresolved,
    markBlock,
    announcement,
    jumping,
    jumps,
    byId,
    resolve,
    jump,
    returnToOrigin,
    endExploration,
    reobserve,
    announce,
  }
}

export type Navigator = ReturnType<typeof createNavigator>
