/**
 * Docking for the persistent ruler, kept separate from expansion.
 *
 * The ruler lives in a mount that is `position: sticky` inside the article
 * body (so the sticky containing block is the whole article, not the chart
 * slot), below the measured wiki header. A zero-height sentinel sits just
 * before the mount: the panel's own geometry never moves it, so docking is
 * decided from the document, not from the panel.
 *
 *   stuck       the mount is pinned below the header right now
 *   contracted  the overview has given way to the compact strip: exactly while
 *               docked. In its place in the article the timeline is always open.
 *               (No hysteresis is needed: docking is read from the sentinel,
 *               which the panel's own height never moves.)
 *
 * Anchoring: while stuck, the mount is still in flow, so when the panel
 * changes height everything after it moves by the same amount: the source
 * line under the panel follows its lower edge, by layout alone. The only
 * other mechanism that could also compensate is native scroll anchoring, so
 * it is switched off on the document scroller for the length of a panel
 * transition only (`holdAnchoring`, until the panel has reached its target
 * height), and back on afterwards.
 */
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

import { MOTION_MS } from './layout'

/** The wiki header and anything else pinned at the top that is not ours. */
function measureHeader(own: HTMLElement | null): number {
  let bottom = 0
  document
    // The wiki header, and the article editor's toolbar (fixed at the top on phones).
    .querySelectorAll<HTMLElement>('header, .vector-sticky-header, .minerva-header, .ve-toolbar, [data-sticky-header]')
    .forEach((el) => {
      if (own && (own.contains(el) || el.contains(own))) return
      const cs = getComputedStyle(el)
      if (cs.position !== 'fixed' && cs.position !== 'sticky') return
      if (cs.display === 'none' || cs.visibility === 'hidden') return
      const r = el.getBoundingClientRect()
      if (r.height && r.top <= 1 && r.bottom > 0) bottom = Math.max(bottom, r.bottom)
    })
  return Math.round(bottom)
}

/**
 * `keepContracted`: while true (a jump on its way to a passage below), the strip
 * stays compact even before it docks, so the geometry the jump aimed with holds.
 */
export function useDock(mount: Ref<HTMLElement | null>, keepContracted: () => boolean = () => false) {
  const header = ref(0)
  /** The visible viewport height (follows mobile browser chrome). */
  const viewH = ref(window.visualViewport?.height ?? window.innerHeight)
  const stuck = ref(false)
  const contracted = ref(false)
  const sentinel = document.createElement('div')
  sentinel.className = 'tn-dock-sentinel'
  sentinel.setAttribute('aria-hidden', 'true')

  function place() {
    const m = mount.value
    if (m && m.isConnected && m.previousElementSibling !== sentinel) m.before(sentinel)
  }

  watch(
    mount,
    (m, old) => {
      if (old) {
        old.classList.remove('tn-mount--sticky', 'tn-mount--ruler')
        delete old.dataset.tnObstruct
        old.style.removeProperty('top')
      }
      if (!m) return
      m.classList.add('tn-mount--sticky', 'tn-mount--ruler')
      // Jumps keep their target below the ruler.
      m.dataset.tnObstruct = 'top'
      place()
      check()
    },
    { immediate: true },
  )

  /** Re-measure and update docking. Called on scroll and resize. */
  function check() {
    const m = mount.value
    if (!m || !m.isConnected) return
    place()
    header.value = measureHeader(m)
    m.style.top = `${header.value}px`
    viewH.value = window.visualViewport?.height ?? window.innerHeight
    const marginTop = parseFloat(getComputedStyle(m).marginTop) || 0
    const s = sentinel.getBoundingClientRect().top
    stuck.value = s + marginTop <= header.value + 0.5
    contracted.value = stuck.value || (contracted.value && keepContracted())
  }

  let timer: ReturnType<typeof setTimeout> | null = null
  /**
   * Native scroll anchoring off on the document scroller for one panel
   * transition: until the panel's rendered geometry has reached its target
   * (`settled`), not for a fixed time, so a slow or throttled renderer cannot
   * let anchoring compensate for the tail of the change.
   */
  function holdAnchoring(settled: () => boolean) {
    document.documentElement.classList.add('tn-anchor-off')
    if (timer) clearTimeout(timer)
    const start = performance.now()
    const tick = () => {
      const t = performance.now() - start
      if ((t >= MOTION_MS && settled()) || t > 4000) {
        document.documentElement.classList.remove('tn-anchor-off')
        timer = null
      } else timer = setTimeout(tick, 40)
    }
    timer = setTimeout(tick, 40)
  }

  const vv = window.visualViewport
  vv?.addEventListener('resize', check)
  onBeforeUnmount(() => {
    vv?.removeEventListener('resize', check)
    if (timer) clearTimeout(timer)
    document.documentElement.classList.remove('tn-anchor-off')
    sentinel.remove()
    const m = mount.value
    if (m) {
      m.classList.remove('tn-mount--sticky', 'tn-mount--ruler')
      delete m.dataset.tnObstruct
      m.style.removeProperty('top')
    }
  })

  return { header, viewH, stuck, contracted, check, holdAnchoring, sentinel }
}
