/** What every form renderer takes and emits, and two helpers they share. */
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

import type { Visual } from '../../model/visual'

export interface FormProps {
  visual: Visual
  /** The selected item (the frame shows its card and dims the rest through this). */
  selectedId: string | null
  /** Label language ("en", "eu", "fr"). */
  lang?: string
  skin?: 'desktop' | 'mobile'
  /** Timeline spacing (prototype control). */
  spacing?: 'proportional' | 'even'
}
export type FormEmits = { select: [id: string | null] }

/** The element's width, now and as it changes. */
export function useWidth(el: Ref<HTMLElement | null>) {
  const width = ref(0)
  let ro: ResizeObserver | null = null
  onMounted(() => {
    if (!el.value) return
    width.value = Math.round(el.value.getBoundingClientRect().width)
    ro = new ResizeObserver(([e]) => (width.value = Math.round(e.contentRect.width)))
    ro.observe(el.value)
  })
  onBeforeUnmount(() => ro?.disconnect())
  return width
}

/** Numeric visualization tokens (px), read where the figure sits. */
export function readPx(el: Element, names: Record<string, number>): Record<string, number> {
  const cs = getComputedStyle(el)
  return Object.fromEntries(
    Object.entries(names).map(([k, d]) => [k, parseFloat(cs.getPropertyValue(`--viz-${k}`)) || d]),
  )
}

/** "15963" → "15,963"; keeps decimals as the table gave them. */
export const fmt = (v: number) =>
  (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2 })
