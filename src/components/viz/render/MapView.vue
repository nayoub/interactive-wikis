<script setup lang="ts">
/**
 * Render: draws a map from a plain list of places, styled only by the shared
 * visualization tokens (../tokens.css). The timeline's sibling: the same dot,
 * the same hue, the same type, the same rules. Knows nothing about the article.
 *
 * - Base: Natural Earth land and lakes, pre-projected (Web Mercator) at build
 *   time at three levels of detail (./baseMap.ts): 1:110m for the world, 1:50m
 *   for continents, 1:10m tiles fetched for what is on screen when zoomed in.
 *   Moved with a transform; always weaker than the marks.
 * - Extent: fitted to the places with a margin, never closer than a minimum span.
 * - Marks: one dot per place. Dots that would overlap merge into one circle
 *   whose area is proportional to the count, number inside; tap to zoom in.
 * - Labels: placed beside dots where they fit without collision; otherwise on tap.
 * - Shade by date (option): four lightness steps of the one hue, oldest lightest.
 * - Fallback: places grouped by country (also what print gets).
 * Underneath, the marks are an ordered list, reachable in order.
 */
import '../tokens.css'

import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { CdxButton, CdxIcon } from '@wikimedia/codex'
import {
  cdxIconAdd,
  cdxIconClose,
  cdxIconFullscreen,
  cdxIconSubtract,
} from '@wikimedia/codex-icons'

import { dateYears, formatDate } from '../model/dates'
import { sortPlaces } from '../model/places'
import { levelFor, loadCoarse, loadTiles, loaded, tilesFor } from './baseMap'
import type { MapOptions, Place } from '../model/types'

const props = withDefaults(
  defineProps<{
    places: Place[]
    title?: string
    fallback?: boolean
    options?: MapOptions
    /** Places to show as active (selected here, or linked from the timeline). */
    activeIds?: string[]
    /** Allow "Show in article" (off in previews). */
    canShowSource?: boolean
  }>(),
  {
    title: 'Map',
    fallback: false,
    options: () => ({ shadeByDate: false }),
    activeIds: () => [],
    canShowSource: true,
  },
)

const emit = defineEmits<{
  /** "Show in article" in a callout. */
  select: [place: Place]
  /** A place was tapped (for linking with other modules). */
  focus: [place: Place | null]
}>()

// ── Order: by date where dates exist, then by name ─────────────────────────
const sorted = computed(() => sortPlaces(props.places))

// ── Size and tokens ────────────────────────────────────────────────────────
const rootRef = ref<HTMLElement | null>(null)
const mapRef = ref<HTMLElement | null>(null)
const measureRef = ref<HTMLElement | null>(null)
const width = ref(0)
const tok = ref({
  dot: 7,
  unit: 9,
  gap: 4,
  margin: 0.14,
  minSpan: 0.004,
  aspect: 0.6,
  aspectNarrow: 1,
})
let ro: ResizeObserver | null = null
onMounted(async () => {
  const el = rootRef.value
  if (!el) return
  const cs = getComputedStyle(el)
  const num = (name: string, fallback: number) => parseFloat(cs.getPropertyValue(name)) || fallback
  tok.value = {
    dot: num('--viz-dot-size', 7),
    unit: num('--viz-cluster-unit', 9),
    gap: num('--viz-label-gap', 4),
    margin: num('--viz-map-margin', 0.14),
    minSpan: num('--viz-map-min-span', 0.004),
    aspect: num('--viz-map-aspect', 0.6),
    aspectNarrow: num('--viz-map-aspect-narrow', 1),
  }
  width.value = el.getBoundingClientRect().width
  ro = new ResizeObserver(([entry]) => (width.value = entry.contentRect.width))
  ro.observe(el)
})
onBeforeUnmount(() => ro?.disconnect())

const narrow = computed(() => width.value < 560)
const height = computed(() =>
  Math.round(width.value * (narrow.value ? tok.value.aspectNarrow : tok.value.aspect)),
)

// ── Projection (Web Mercator, world = 1×1) and view ────────────────────────
function project(lat: number, lon: number) {
  const φ = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180
  return { x: (lon + 180) / 360, y: (1 - Math.log(Math.tan(Math.PI / 4 + φ / 2)) / Math.PI) / 2 }
}
const world = computed(() => sorted.value.map((p) => project(p.coordinates.lat, p.coordinates.lon)))

/** The view: world point (cx, cy) at the centre, k pixels per world width. */
const view = reactive({ cx: 0.5, cy: 0.5, k: 1 })
function fitTo(points: { x: number; y: number }[], minSpan = tok.value.minSpan) {
  if (!points.length || !width.value) return
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  const m = 1 + 2 * tok.value.margin
  const spanX = Math.max(x1 - x0, minSpan)
  const spanY = Math.max(y1 - y0, minSpan * (height.value / width.value))
  view.cx = (x0 + x1) / 2
  view.cy = (y0 + y1) / 2
  view.k = Math.min(width.value / (spanX * m), height.value / (spanY * m))
}
const fitted = ref({ cx: 0.5, cy: 0.5, k: 1 })
function fitAll() {
  fitTo(world.value)
  fitted.value = { ...view }
}
watch([world, width, height], () => fitAll(), { immediate: true })
const zoomedIn = computed(
  () =>
    Math.abs(view.k - fitted.value.k) > 1e-6 ||
    Math.abs(view.cx - fitted.value.cx) > 1e-9 ||
    Math.abs(view.cy - fitted.value.cy) > 1e-9,
)

const toScreen = (p: { x: number; y: number }) => ({
  x: (p.x - view.cx) * view.k + width.value / 2,
  y: (p.y - view.cy) * view.k + height.value / 2,
})
/** SVG transform for base-map paths stored at `scale` units per world width. */
const transformFor = (scale: number) =>
  `translate(${width.value / 2 - view.cx * view.k} ${height.value / 2 - view.cy * view.k}) scale(${view.k / scale})`

// ── Base map: the level of detail the view needs, falling back while it loads ──
const viewBounds = computed(() => {
  const hw = width.value / 2 / view.k
  const hh = height.value / 2 / view.k
  return { x0: view.cx - hw, y0: view.cy - hh, x1: view.cx + hw, y1: view.cy + hh }
})
const wantLevel = computed(() => levelFor(view.k))
let tileTimer: ReturnType<typeof setTimeout> | undefined
watch(
  [wantLevel, viewBounds],
  ([level, b]) => {
    loadCoarse('110m').catch(() => {})
    if (level !== '110m') loadCoarse('50m').catch(() => {})
    if (level === '10m') {
      // Debounced: panning and pinching ask for tiles once they settle.
      clearTimeout(tileTimer)
      tileTimer = setTimeout(() => loadTiles(b.x0, b.y0, b.x1, b.y1).catch(() => {}), 120)
    }
  },
  { immediate: true },
)
const fineTiles = computed(() => {
  if (wantLevel.value !== '10m') return []
  const b = viewBounds.value
  const keys = tilesFor(b.x0, b.y0, b.x1, b.y1)
  return keys.every((k) => loaded.tiles[k]) ? keys.map((k) => loaded.tiles[k]) : []
})
/** The coarse layer to draw: the wanted one, or the best one loaded while the finer one arrives. */
const coarseLayer = computed(() => {
  if (fineTiles.value.length) return null
  const want = wantLevel.value === '110m' ? '110m' : '50m'
  return loaded.coarse[want] ?? loaded.coarse['50m'] ?? loaded.coarse['110m'] ?? null
})
const fineScale = computed(() => loaded.fine?.scale ?? 1)

// ── Clusters: merge dots that would overlap; area ∝ count ──────────────────
interface Cluster {
  ids: number[] // indexes into `sorted`
  x: number
  y: number
  r: number
}
const clusters = computed<Cluster[]>(() => {
  const d = tok.value.dot
  const pts = world.value.map(toScreen)
  let groups: Cluster[] = pts.map((p, i) => ({ ids: [i], x: p.x, y: p.y, r: d / 2 }))
  const radius = (n: number) => (n === 1 ? d / 2 : tok.value.unit * Math.sqrt(n))
  // Merge until nothing overlaps (a dot needs its own diameter plus a hair of space).
  for (let changed = true; changed;) {
    changed = false
    outer: for (let a = 0; a < groups.length; a++) {
      for (let b = a + 1; b < groups.length; b++) {
        const A = groups[a]
        const B = groups[b]
        if (Math.hypot(A.x - B.x, A.y - B.y) < A.r + B.r + 2) {
          const ids = [...A.ids, ...B.ids].sort((i, j) => i - j)
          const x = ids.reduce((s, i) => s + pts[i].x, 0) / ids.length
          const y = ids.reduce((s, i) => s + pts[i].y, 0) / ids.length
          groups = groups.filter((_, k) => k !== a && k !== b)
          groups.push({ ids, x, y, r: radius(ids.length) })
          changed = true
          break outer
        }
      }
    }
  }
  return groups.sort((A, B) => A.ids[0] - B.ids[0])
})
const clusterOf = computed(() => {
  const out = new Map<number, Cluster>()
  clusters.value.forEach((c) => c.ids.forEach((i) => out.set(i, c)))
  return out
})
const visible = (c: Cluster) =>
  c.x + c.r > 0 && c.x - c.r < width.value && c.y + c.r > 0 && c.y - c.r < height.value

function zoomToCluster(c: Cluster) {
  // The minimum extent is for the first view only: a cluster tap always gets closer
  // (at least 2×), however near its members sit — never a tap that does nothing.
  const before = view.k
  fitTo(
    c.ids.map((i) => world.value[i]),
    tok.value.minSpan / 50,
  )
  if (view.k < before * 2) view.k = before * 2
  view.k = clampK(view.k)
  closeCallout()
}

// ── Shade by date: four lightness steps, oldest lightest ───────────────────
const years = computed(() => sorted.value.map((p) => (p.date ? dateYears(p.date) : null)))
const steps = computed(() => {
  const ys = years.value.filter((y): y is number => y !== null)
  if (!props.options.shadeByDate || !ys.length) return []
  const min = Math.floor(Math.min(...ys))
  const max = Math.floor(Math.max(...ys))
  const size = Math.max(1, Math.ceil((max - min + 1) / 4))
  return [0, 1, 2, 3]
    .map((k) => ({
      step: k + 1,
      from: min + k * size,
      to: Math.min(max, min + (k + 1) * size - 1),
    }))
    .filter((s) => s.from <= max)
})
function stepOf(i: number): number | null {
  const y = years.value[i]
  if (y === null || !steps.value.length) return null
  const s = steps.value.find((st) => Math.floor(y) >= st.from && Math.floor(y) <= st.to)
  return s ? s.step : steps.value[steps.value.length - 1].step
}

// ── Labels: beside the dot where they fit, else on tap ─────────────────────
const labelWidths = ref<number[]>([])
const labelHeight = ref(18)
watch(
  // Re-measure when shown (a hidden tab measures 0) or resized.
  [sorted, () => measureRef.value, width],
  () =>
    nextTick(() => {
      const el = measureRef.value
      if (!el) return
      labelHeight.value = el.getBoundingClientRect().height || 18
      labelWidths.value = sorted.value.map((p) => {
        el.textContent = nameOf(p)
        return el.getBoundingClientRect().width
      })
    }),
  { immediate: true },
)
interface Box {
  x: number
  y: number
  w: number
  h: number
}
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const labels = computed(() => {
  const out = new Map<number, { x: number; y: number; align: 'start' | 'end' }>()
  const h = labelHeight.value
  const g = tok.value.gap
  const taken: Box[] = clusters.value
    .filter(visible)
    .map((c) => ({ x: c.x - c.r, y: c.y - c.r, w: 2 * c.r, h: 2 * c.r }))
  for (const c of clusters.value) {
    if (c.ids.length !== 1 || !visible(c)) continue
    const i = c.ids[0]
    const w = labelWidths.value[i] ?? 0
    if (!w) continue
    const r = c.r
    const tries: { box: Box; align: 'start' | 'end' }[] = [
      { box: { x: c.x + r + g, y: c.y - h / 2, w, h }, align: 'start' },
      { box: { x: c.x - r - g - w, y: c.y - h / 2, w, h }, align: 'end' },
      { box: { x: c.x - w / 2, y: c.y - r - g - h, w, h }, align: 'start' },
      { box: { x: c.x - w / 2, y: c.y + r + g, w, h }, align: 'start' },
    ]
    for (const t of tries) {
      const b = t.box
      const inside = b.x >= 0 && b.y >= 0 && b.x + b.w <= width.value && b.y + b.h <= height.value
      if (inside && !taken.some((o) => overlaps(o, b))) {
        taken.push(b)
        out.set(i, { x: b.x, y: b.y, align: t.align })
        break
      }
    }
  }
  return out
})

// ── Callout ────────────────────────────────────────────────────────────────
const openIndex = ref<number | null>(null)
const openPlace = computed(() => (openIndex.value === null ? null : sorted.value[openIndex.value]))
function openCallout(i: number) {
  openIndex.value = openIndex.value === i ? null : i
  emit('focus', openIndex.value === null ? null : sorted.value[i])
}
function closeCallout() {
  if (openIndex.value !== null) emit('focus', null)
  openIndex.value = null
}
const calloutStyle = computed(() => {
  const i = openIndex.value
  if (i === null) return {}
  const c = clusterOf.value.get(i)
  if (!c) return {}
  const below = c.y < height.value / 2
  return {
    left: `${Math.max(8, Math.min(width.value - 8, c.x))}px`,
    top: `${below ? c.y + c.r + tok.value.gap : c.y - c.r - tok.value.gap}px`,
    '--callout-shift': below ? '0%' : '-100%',
  }
})
const year = (p: Place) => (p.date ? formatDate(p.date) : null)
/** What the map calls a place: the editor's label (drafted from the article's own wording). */
const nameOf = (p: Place) => p.label || p.name

// ── Pan and zoom: drag, pinch, ctrl/⌘+wheel (trackpad pinch), buttons ─────
const pointers = new Map<number, { x: number; y: number }>()
let dragged = false
let start: {
  cx: number
  cy: number
  k: number
  mid: { x: number; y: number }
  dist: number
} | null = null
const local = (e: PointerEvent | WheelEvent) => {
  const r = mapRef.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}
function snapshot() {
  const pts = [...pointers.values()]
  const mid = {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  }
  const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0
  start = { cx: view.cx, cy: view.cy, k: view.k, mid, dist }
}
function onPointerDown(e: PointerEvent) {
  pointers.set(e.pointerId, local(e))
  dragged = false
  snapshot()
}
function onPointerMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId) || !start) return
  pointers.set(e.pointerId, local(e))
  const pts = [...pointers.values()]
  const mid = {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  }
  if (!dragged && Math.hypot(mid.x - start.mid.x, mid.y - start.mid.y) < 4 && pts.length < 2) return
  if (!dragged) {
    dragged = true
    mapRef.value?.setPointerCapture(e.pointerId)
  }
  let k = start.k
  if (pts.length > 1 && start.dist) {
    k = clampK(start.k * (Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / start.dist))
  }
  // Keep the world point under the starting midpoint under the current midpoint.
  const wx = start.cx + (start.mid.x - width.value / 2) / start.k
  const wy = start.cy + (start.mid.y - height.value / 2) / start.k
  view.k = k
  view.cx = wx - (mid.x - width.value / 2) / k
  view.cy = wy - (mid.y - height.value / 2) / k
}
function onPointerUp(e: PointerEvent) {
  pointers.delete(e.pointerId)
  if (pointers.size) snapshot()
  else start = null
}
function onClickCapture(e: MouseEvent) {
  // A drag is not a tap.
  if (dragged) {
    e.stopPropagation()
    e.preventDefault()
    dragged = false
  }
}
function onWheel(e: WheelEvent) {
  if (!e.ctrlKey && !e.metaKey) return // plain wheel scrolls the page
  e.preventDefault()
  zoomAt(local(e), Math.exp(-e.deltaY * 0.01))
}
const clampK = (k: number) => Math.max(fitted.value.k * 0.5, Math.min(fitted.value.k * 400, k))
function zoomAt(at: { x: number; y: number }, factor: number) {
  const wx = view.cx + (at.x - width.value / 2) / view.k
  const wy = view.cy + (at.y - height.value / 2) / view.k
  view.k = clampK(view.k * factor)
  view.cx = wx - (at.x - width.value / 2) / view.k
  view.cy = wy - (at.y - height.value / 2) / view.k
}
const zoomBy = (f: number) => zoomAt({ x: width.value / 2, y: height.value / 2 }, f)
function showAll() {
  Object.assign(view, fitted.value)
  closeCallout()
}

// ── Keyboard: marks in list order ──────────────────────────────────────────
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') return closeCallout()
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
  if (!keys.includes(e.key)) return
  const marks = Array.from(
    rootRef.value?.querySelectorAll<HTMLElement>('.map__rich .map__mark') ?? [],
  )
  const i = marks.indexOf(document.activeElement as HTMLElement)
  if (i === -1) return
  e.preventDefault()
  let next = i
  if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = marks.length - 1
  else next = i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1)
  marks[Math.max(0, Math.min(marks.length - 1, next))]?.focus()
}
function focusPlace(id: string) {
  const i = sorted.value.findIndex((p) => p.id === id)
  if (i === -1) return
  const c = clusterOf.value.get(i)
  if (c && c.ids.length > 1) zoomToCluster(c)
  nextTick(() => {
    openIndex.value = i
    rootRef.value
      ?.querySelector<HTMLElement>(`.map__rich [data-place-id="${id}"] .map__mark`)
      ?.focus({ preventScroll: true })
  })
}
defineExpose({ focusPlace, el: rootRef })

// ── Fallback grouping and meta ─────────────────────────────────────────────
const byCountry = computed(() => {
  const groups = new Map<string, Place[]>()
  for (const p of sorted.value) {
    const k = p.country ?? 'Unknown country'
    groups.set(k, [...(groups.get(k) ?? []), p])
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
})
const meta = computed(() => {
  const n = sorted.value.length
  const c = new Set(sorted.value.map((p) => p.country ?? '?')).size
  return `${n} ${n === 1 ? 'place' : 'places'} · ${c} ${c === 1 ? 'country' : 'countries'}`
})
const active = (id: string) => props.activeIds.includes(id)
const commonsImages = computed(() =>
  sorted.value.flatMap((p) => (p.image?.source === 'commons' ? [p.image] : [])),
)
const titleId = `map-title-${Math.random().toString(36).slice(2, 8)}`
</script>

<template>
  <div
    ref="rootRef"
    class="viz map"
    :class="{ 'map--fallback': fallback, 'map--narrow': narrow }"
    role="group"
    :aria-labelledby="titleId"
    @keydown="onKeydown"
  >
    <div class="map__header">
      <div :id="titleId" class="map__title">{{ title || 'Map' }}</div>
      <small v-if="sorted.length" class="map__meta">{{ meta }}</small>
    </div>

    <p v-if="!sorted.length" class="map__empty">No places yet.</p>

    <!-- Plain list grouped by country: the no-JavaScript / print rendering. -->
    <div class="map-fallback">
      <div v-for="[country, list] in byCountry" :key="country" class="map-fallback__group">
        <b>{{ country }}</b>
        <ul>
          <li v-for="p in list" :key="p.id">
            <a
              v-if="p.sourceAnchor"
              :href="`#tl-src-${p.sourceAnchor.mentionId}`"
              @click.prevent="emit('select', p)"
              >{{ nameOf(p) }}</a
            ><template v-else>{{ nameOf(p) }}</template
            ><template v-if="year(p)"> ({{ year(p) }})</template
            ><sup v-if="p.citation" class="reference"
              ><a :href="p.citation.href">{{ p.citation.label }}</a></sup
            >
          </li>
        </ul>
      </div>
    </div>

    <div v-if="sorted.length && !fallback" class="map__rich">
      <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
      <div
        ref="mapRef"
        class="map__surface"
        :style="{ height: `${height}px` }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @click.capture="onClickCapture"
        @wheel="onWheel"
      >
        <svg class="map__base" :width="width" :height="height" aria-hidden="true">
          <g v-if="coarseLayer" :transform="transformFor(coarseLayer.scale)">
            <path class="map__land" :d="coarseLayer.land" />
            <path class="map__lake" :d="coarseLayer.lakes" />
          </g>
          <g v-else :transform="transformFor(fineScale)">
            <!-- Tiles: fills first (seams are not stroked), then the coast as open lines. -->
            <path
              v-for="t in fineTiles"
              :key="`l${t.key}`"
              class="map__land map__fill"
              :d="t.land"
            />
            <path
              v-for="t in fineTiles"
              :key="`w${t.key}`"
              class="map__lake map__fill"
              :d="t.lakes"
            />
            <path v-for="t in fineTiles" :key="`c${t.key}`" class="map__coast" :d="t.coast" />
            <path v-for="t in fineTiles" :key="`s${t.key}`" class="map__coast" :d="t.shores" />
          </g>
        </svg>

        <ol class="map__list">
          <li v-for="(p, i) in sorted" :key="p.id" :data-place-id="p.id" class="map__item">
            <template v-if="clusterOf.get(i) && visible(clusterOf.get(i)!)">
              <!-- A lone place: its dot. -->
              <button
                v-if="clusterOf.get(i)!.ids.length === 1"
                type="button"
                class="map__mark"
                :class="[
                  stepOf(i) ? `map__mark--step${stepOf(i)}` : '',
                  { 'map__mark--lit': active(p.id) || openIndex === i },
                ]"
                :style="{ left: `${clusterOf.get(i)!.x}px`, top: `${clusterOf.get(i)!.y}px` }"
                :aria-label="`${nameOf(p)}${year(p) ? ', ' + year(p) : ''}`"
                :aria-expanded="openIndex === i"
                @click="openCallout(i)"
              />
              <!-- The first place of a cluster carries the cluster. -->
              <button
                v-else-if="clusterOf.get(i)!.ids[0] === i"
                type="button"
                class="map__mark map__cluster"
                :class="{
                  'map__mark--lit': clusterOf.get(i)!.ids.some((k) => active(sorted[k].id)),
                }"
                :style="{
                  left: `${clusterOf.get(i)!.x}px`,
                  top: `${clusterOf.get(i)!.y}px`,
                  width: `${2 * clusterOf.get(i)!.r}px`,
                  height: `${2 * clusterOf.get(i)!.r}px`,
                }"
                :aria-label="`${clusterOf.get(i)!.ids.length} places here: ${clusterOf
                  .get(i)!
                  .ids.map((k) => nameOf(sorted[k]))
                  .join(', ')}. Zoom in`"
                @click="zoomToCluster(clusterOf.get(i)!)"
              >
                <small>{{ clusterOf.get(i)!.ids.length }}</small>
              </button>
            </template>
            <small
              v-if="labels.get(i)"
              class="map__label"
              :class="{ 'map__label--lit': active(p.id) || openIndex === i }"
              :style="{ left: `${labels.get(i)!.x}px`, top: `${labels.get(i)!.y}px` }"
              aria-hidden="true"
              >{{ nameOf(p) }}</small
            >
          </li>
        </ol>

        <div
          v-if="openPlace"
          class="map__callout"
          :style="calloutStyle"
          role="dialog"
          :aria-label="nameOf(openPlace)"
        >
          <button type="button" class="map__callout-close" aria-label="Close" @click="closeCallout">
            <CdxIcon :icon="cdxIconClose" size="x-small" />
          </button>
          <img
            v-if="openPlace.image"
            class="map__img"
            :src="openPlace.image.src"
            :alt="openPlace.image.caption"
            :title="openPlace.image.fileTitle ?? openPlace.image.caption"
          />
          <div class="map__callout-name">{{ nameOf(openPlace) }}</div>
          <small v-if="openPlace.name !== nameOf(openPlace)" class="map__callout-label">{{
            openPlace.name
          }}</small>
          <small class="map__callout-meta"
            >{{ openPlace.country ?? 'Unknown country'
            }}<template v-if="year(openPlace)"> · {{ year(openPlace) }}</template></small
          >
          <button
            v-if="openPlace.sourceAnchor && canShowSource"
            type="button"
            class="map__callout-link"
            @click="emit('select', openPlace)"
          >
            <small>Show in article</small>
          </button>
          <small v-else-if="!openPlace.sourceAnchor" class="map__callout-meta"
            >Not mentioned in the article text.</small
          >
        </div>

        <div class="map__controls">
          <CdxButton size="small" weight="quiet" aria-label="Zoom in" @click="zoomBy(1.6)">
            <CdxIcon :icon="cdxIconAdd" size="small" />
          </CdxButton>
          <CdxButton size="small" weight="quiet" aria-label="Zoom out" @click="zoomBy(1 / 1.6)">
            <CdxIcon :icon="cdxIconSubtract" size="small" />
          </CdxButton>
          <CdxButton
            v-if="zoomedIn"
            size="small"
            weight="quiet"
            aria-label="Show all places"
            @click="showAll"
          >
            <CdxIcon :icon="cdxIconFullscreen" size="small" />
          </CdxButton>
        </div>
      </div>

      <div v-if="steps.length" class="map__legend" aria-label="Shade by date">
        <span v-for="s in steps" :key="s.step" class="map__legend-step">
          <span class="map__swatch" :class="`map__mark--step${s.step}`" aria-hidden="true" />
          <small>{{ s.from === s.to ? s.from : `${s.from}–${s.to}` }}</small>
        </span>
        <span v-if="years.some((y) => y === null)" class="map__legend-step">
          <span class="map__swatch" aria-hidden="true" />
          <small>No date</small>
        </span>
      </div>
    </div>

    <p v-if="commonsImages.length" class="map__credits">
      <small
        >Images from Wikimedia Commons:
        <template v-for="(img, k) in commonsImages" :key="img.id"
          ><a :href="img.pageUrl" target="_blank" rel="noopener">{{ img.artist }}</a
          >, {{ img.license }}{{ k < commonsImages.length - 1 ? '; ' : '' }}</template
        ></small
      >
    </p>

    <small ref="measureRef" class="map__label map__measure" aria-hidden="true" />
  </div>
</template>

<style scoped>
/* Everything here reads ../tokens.css; no literal colours, weights or sizes. */
.map {
  display: flow-root;
  min-width: 0;
  margin-block: var(--viz-space-xxl);
  padding-block: var(--viz-space-l) var(--viz-space-xl);
  border-top: var(--viz-line-width) solid var(--viz-rule);
  border-bottom: var(--viz-line-width) solid var(--viz-rule-light);
  color: var(--viz-ink);
  font-family: var(--viz-font-family);
  position: relative;
}
.map__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--viz-space-m);
  margin-block-end: var(--viz-space-l);
}
.map__title,
.map__callout-name {
  font-family: var(--viz-font-family);
  font-size: var(--viz-heading-size);
  font-weight: var(--viz-heading-weight);
  line-height: var(--viz-heading-line);
}
small,
.map__label {
  font-family: var(--viz-font-family);
  font-size: var(--viz-small-size);
  font-weight: var(--viz-small-weight);
  line-height: var(--viz-small-line);
}
.map__meta,
.map__empty {
  margin: 0;
  color: var(--viz-ink-tertiary);
}

/* Fallback: hidden unless asked for, or printing. */
.map-fallback {
  display: none;
}
.map--fallback .map-fallback {
  display: block;
}
.map-fallback__group + .map-fallback__group {
  margin-top: var(--viz-space-m);
}
.map .map-fallback ul {
  margin: var(--viz-space-xs) 0 0 1.6em;
}

/* ── The map ────────────────────────────────────────────────────────────── */
.map__surface {
  position: relative;
  overflow: hidden;
  touch-action: none; /* drag and pinch here; the page scrolls outside the map */
  user-select: none;
  -webkit-user-select: none;
  cursor: grab;
}
.map__surface:active {
  cursor: grabbing;
}
.map__base {
  position: absolute;
  inset: 0;
}
.map__land,
.map__lake,
.map__coast {
  stroke: var(--viz-coast);
  stroke-width: var(--viz-line-width);
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
.map__land {
  fill: var(--viz-land);
  fill-rule: evenodd;
}
.map__lake {
  fill: var(--viz-water);
}
.map__coast {
  fill: none;
}
.map__fill {
  stroke: none;
}
.map .map__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.map .map__item {
  margin: 0;
}

/* The one dot (same as the timeline's), with a larger hit area. */
.map__mark {
  position: absolute;
  width: calc(var(--viz-dot-size) * 3);
  height: calc(var(--viz-dot-size) * 3);
  padding: 0;
  border: 0;
  background: none;
  transform: translate(-50%, -50%);
  cursor: pointer;
}
.map__mark::before {
  content: '';
  position: absolute;
  inset: 50% auto auto 50%;
  width: var(--viz-dot-size);
  height: var(--viz-dot-size);
  margin: calc(var(--viz-dot-size) / -2) 0 0 calc(var(--viz-dot-size) / -2);
  border-radius: 50%;
  background: var(--dot, var(--viz-ink));
  transition: background-color var(--viz-transition);
}
.map__mark--step1 {
  --dot: var(--viz-step-1);
}
.map__mark--step2 {
  --dot: var(--viz-step-2);
}
.map__mark--step3 {
  --dot: var(--viz-step-3);
}
.map__mark--step4 {
  --dot: var(--viz-step-4);
}
.map__mark--lit::before {
  background: var(--viz-accent);
  outline: var(--viz-line-width) solid var(--viz-accent);
  outline-offset: var(--viz-line-width);
}
.map__mark:focus-visible {
  outline: none;
}
.map__mark:focus-visible::before {
  outline: var(--viz-focus-width) solid var(--viz-accent);
  outline-offset: var(--viz-focus-width);
}

/* A cluster: one circle, area ∝ count, the number inside. */
.map__cluster {
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--viz-ink);
  color: var(--viz-cluster-ink);
}
.map__cluster::before {
  display: none;
}
.map__cluster.map__mark--lit {
  background: var(--viz-accent);
}
.map__cluster:focus-visible {
  outline: var(--viz-focus-width) solid var(--viz-accent);
  outline-offset: var(--viz-focus-width);
}

.map__label {
  position: absolute;
  white-space: nowrap;
  color: var(--viz-ink-secondary);
  pointer-events: none;
}
.map__label--lit {
  color: var(--viz-accent);
}
.map__measure {
  position: absolute;
  visibility: hidden;
  left: 0;
  top: 0;
}

/* Callout: a small plain box, thin rule, no shadow. */
.map__callout {
  position: absolute;
  z-index: 2;
  width: calc(var(--viz-image-width) * 2.2);
  max-width: calc(100% - 2 * var(--viz-space-s));
  padding: var(--viz-space-s) var(--viz-space-m) var(--viz-space-m);
  transform: translate(-50%, var(--callout-shift, 0%));
  background: var(--viz-paper);
  border: var(--viz-line-width) solid var(--viz-rule);
  border-radius: var(--viz-radius);
  cursor: default;
}
.map--narrow .map__callout {
  left: 50% !important;
}
.map__callout-close {
  position: absolute;
  top: var(--viz-space-xs);
  right: var(--viz-space-xs);
  padding: var(--viz-space-xs);
  border: 0;
  background: none;
  color: var(--viz-ink-tertiary);
  cursor: pointer;
}
.map__img {
  display: block;
  width: var(--viz-image-width);
  height: var(--viz-image-height);
  object-fit: var(--viz-image-fit);
  border-radius: var(--viz-radius);
  background: var(--viz-image-empty);
  margin-bottom: var(--viz-space-s);
}
.map__callout-meta,
.map__callout-label {
  display: block;
  color: var(--viz-ink-secondary);
}
.map__callout-meta {
  color: var(--viz-ink-tertiary);
}
.map__callout-link {
  margin-top: var(--viz-space-s);
  padding: 0;
  border: 0;
  background: none;
  color: var(--viz-accent);
  cursor: pointer;
}
.map__callout-link:hover {
  text-decoration: underline;
}

.map__controls {
  position: absolute;
  top: var(--viz-space-xs);
  right: var(--viz-space-xs);
  display: flex;
  flex-direction: column;
  background: var(--viz-paper);
  border: var(--viz-line-width) solid var(--viz-rule-light);
  border-radius: var(--viz-radius);
}

/* Legend: the four steps and their years. */
.map__legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--viz-space-xs) var(--viz-space-l);
  margin-top: var(--viz-space-m);
  color: var(--viz-ink-tertiary);
}
.map__legend-step {
  display: inline-flex;
  align-items: center;
  gap: var(--viz-space-s);
}
.map__swatch {
  width: var(--viz-dot-size);
  height: var(--viz-dot-size);
  border-radius: 50%;
  background: var(--dot, var(--viz-ink));
}
.map__credits {
  margin: var(--viz-space-l) 0 0;
  color: var(--viz-ink-tertiary);
}
.map .map__credits a {
  color: inherit;
}

@media print {
  .map__rich {
    display: none;
  }
  .map-fallback {
    display: block;
  }
}
</style>
