<script setup lang="ts">
/**
 * Page Previews and Reference Previews, as on Wikipedia (desktop, with a
 * pointer): rest on a link to another article and a card shows its lead
 * image and opening; rest on a footnote marker and its reference shows. The
 * card stays while the pointer is on it, and goes when the pointer has left
 * both. Keyboard focus on a link previews it too; Escape closes the card.
 *
 * Wiki links are recognised as {@link attachInArticleWikiLinks} does (the
 * original `href` is kept in `data-protowiki-wiki-href`), so a preview always
 * names the page a click opens. Summaries come from REST `page/summary`.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { wikimediaApiFetchHeaders } from '@/config'
import { citationHashFromHref, wikiTitleFromArticleHref } from './shared/wikiTitleFromArticleHref'

const props = defineProps<{ root: HTMLElement | null; host: string }>()

/** Wikipedia's timings: a short dwell before showing, a grace period before hiding. */
const SHOW_MS = 500
const HIDE_MS = 300

interface Summary {
  title: string
  extractHtml: string
  url: string
  thumb?: { src: string; width: number; height: number }
  kind: 'standard' | 'disambiguation' | 'missing'
}
type Card =
  | { type: 'page'; summary: Summary }
  | { type: 'reference'; html: string; label: string }

const card = ref<Card | null>(null)
const pos = ref({ left: 0, top: 0, below: true, pokeX: 24 })
const el = ref<HTMLElement | null>(null)
let anchor: HTMLAnchorElement | null = null
let showTimer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null
let abort: AbortController | null = null
const cache = new Map<string, Promise<Summary>>()

const canHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches

function summaryOf(title: string): Promise<Summary> {
  const key = `${props.host}|${title}`
  if (!cache.has(key)) {
    const url = `https://${props.host}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`
    const p = fetch(url, { headers: wikimediaApiFetchHeaders('page-previews') })
      .then(async (r) => {
        if (r.status === 404) return { title, extractHtml: '', url: '', kind: 'missing' as const }
        if (!r.ok) throw new Error(String(r.status))
        const j = await r.json()
        return {
          title: j.titles?.normalized ?? j.title ?? title,
          extractHtml: j.extract_html ?? '',
          url: j.content_urls?.desktop?.page ?? '',
          thumb: j.thumbnail ? { src: j.thumbnail.source, width: j.thumbnail.width, height: j.thumbnail.height } : undefined,
          kind: j.type === 'disambiguation' ? ('disambiguation' as const) : ('standard' as const),
        }
      })
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return cache.get(key)!
}

/** The page a link opens, or null (external, red link, same page, file, citation…). */
function pageTitle(a: HTMLAnchorElement): string | null {
  if (a.classList.contains('new') || a.closest('.mw-editsection, .ve-section-edit, .tl-chip, .tn-mount')) return null
  const href = a.dataset.protowikiWikiHref ?? a.getAttribute('href') ?? ''
  const title = wikiTitleFromArticleHref(href, props.host)
  if (!title || /^(File|Image|Category|Template|Help|Special|Wikipedia|Portal|Talk):/i.test(title)) return null
  return title
}
/** A footnote marker's reference text (from the article's own reference list). */
function referenceOf(a: HTMLAnchorElement): { html: string; label: string } | null {
  if (!a.closest('sup.reference, .mw-ref')) return null
  const hash = citationHashFromHref(a.dataset.protowikiWikiHref ?? a.getAttribute('href') ?? '')
  if (!hash) return null
  const li = props.root?.querySelector<HTMLElement>(`[id="${CSS.escape(hash.slice(1))}"]`)
  const text = li?.querySelector<HTMLElement>('.mw-reference-text, .reference-text') ?? li
  if (!text) return null
  const label = text.querySelector('cite.citation.book, .citation.book') ? 'Book' : text.querySelector('cite.citation.web, .citation.web') ? 'Web' : text.querySelector('cite.citation.journal, .citation.journal') ? 'Journal' : text.querySelector('cite.citation.news, .citation.news') ? 'News' : 'Reference'
  return { html: text.innerHTML, label }
}

function place(a: HTMLAnchorElement, width: number) {
  const r = a.getClientRects()[0] ?? a.getBoundingClientRect()
  const vw = document.documentElement.clientWidth
  const left = Math.max(8, Math.min(vw - width - 8, r.left))
  // Below the link unless it would leave the viewport; then above it.
  const below = r.bottom + 300 < window.innerHeight || r.top < 320
  pos.value = {
    left,
    top: below ? r.bottom + 10 : r.top - 10,
    below,
    pokeX: Math.max(12, Math.min(width - 24, r.left + Math.min(r.width, 40) / 2 - left)),
  }
}

function clearTimers() {
  if (showTimer) clearTimeout(showTimer)
  if (hideTimer) clearTimeout(hideTimer)
  showTimer = hideTimer = null
}
function close() {
  clearTimers()
  abort?.abort()
  abort = null
  card.value = null
  anchor = null
}
function scheduleHide() {
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(close, HIDE_MS)
}

function begin(a: HTMLAnchorElement) {
  if (a === anchor) {
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = null
    return
  }
  const note = referenceOf(a)
  const title = note ? null : pageTitle(a)
  if (!note && !title) return
  close()
  anchor = a
  const controller = new AbortController()
  abort = controller
  showTimer = setTimeout(async () => {
    showTimer = null
    if (note) {
      place(a, 360)
      card.value = { type: 'reference', ...note }
      return
    }
    try {
      const summary = await summaryOf(title!)
      if (controller.signal.aborted || anchor !== a) return
      const portrait = summary.thumb && summary.thumb.height > summary.thumb.width
      place(a, portrait ? 450 : 320)
      card.value = { type: 'page', summary }
    } catch {
      /* No preview: the link still works. */
    }
  }, SHOW_MS)
}

const linkFrom = (t: EventTarget | null) => ((t as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null) ?? null
function onOver(e: Event) {
  const a = linkFrom(e.target)
  if (a && props.root?.contains(a)) begin(a)
}
function onOut(e: MouseEvent | FocusEvent) {
  const a = linkFrom(e.target)
  if (!a || a !== anchor) return
  if (e.relatedTarget && (a.contains(e.relatedTarget as Node) || el.value?.contains(e.relatedTarget as Node))) return
  scheduleHide()
}
/** The pointer reached the card: it stays. */
function keep() {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = null
}
/** Scrolling carries the card with its link (as on the wiki, where it sits in the page). */
function onScroll() {
  if (!card.value || !anchor) return
  if (!anchor.isConnected) return close()
  place(anchor, el.value?.offsetWidth ?? 320)
}
const onKey = (e: KeyboardEvent) => e.key === 'Escape' && card.value && close()

watch(
  () => props.root,
  (root, old) => {
    if (old) {
      old.removeEventListener('mouseover', onOver)
      old.removeEventListener('mouseout', onOut)
      old.removeEventListener('focusin', onOver)
      old.removeEventListener('focusout', onOut)
      close()
    }
    if (!root || !canHover) return
    root.addEventListener('mouseover', onOver)
    root.addEventListener('mouseout', onOut)
    root.addEventListener('focusin', onOver)
    root.addEventListener('focusout', onOut)
  },
  { immediate: true },
)
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', onKey)
  window.addEventListener('scroll', onScroll, { passive: true })
}
onBeforeUnmount(() => {
  close()
  const root = props.root
  root?.removeEventListener('mouseover', onOver)
  root?.removeEventListener('mouseout', onOut)
  root?.removeEventListener('focusin', onOver)
  root?.removeEventListener('focusout', onOut)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', onScroll)
})

const portrait = computed(() => card.value?.type === 'page' && !!card.value.summary.thumb && card.value.summary.thumb.height > card.value.summary.thumb.width)
function openPage() {
  const a = anchor
  close()
  a?.click()
}
</script>

<template>
  <div
    v-if="card"
    ref="el"
    class="pp"
    :class="[`pp--${card.type}`, { 'pp--below': pos.below, 'pp--above': !pos.below, 'pp--portrait': portrait }]"
    :style="{ left: `${pos.left}px`, top: `${pos.top}px`, '--pp-poke': `${pos.pokeX}px` }"
    role="dialog"
    :aria-label="card.type === 'page' ? card.summary.title : card.label"
    @mouseenter="keep"
    @mouseleave="scheduleHide"
  >
    <template v-if="card.type === 'page'">
      <a
        class="pp__body"
        :href="anchor?.href"
        @click.prevent="openPage"
      >
        <img
          v-if="card.summary.thumb && card.summary.kind === 'standard'"
          class="pp__thumb"
          :src="card.summary.thumb.src"
          alt=""
        >
        <div
          v-if="card.summary.kind === 'standard' && card.summary.extractHtml"
          class="pp__extract"
          v-html="card.summary.extractHtml"
        />
        <div
          v-else-if="card.summary.kind === 'disambiguation'"
          class="pp__extract pp__extract--generic"
        >
          <strong>{{ card.summary.title }}</strong> may refer to more than one topic.
        </div>
        <div
          v-else
          class="pp__extract pp__extract--generic"
        >
          There was an issue displaying this preview.
        </div>
      </a>
    </template>
    <template v-else>
      <div class="pp__head">
        {{ card.label }}
      </div>
      <div
        class="pp__ref"
        v-html="card.html"
      />
    </template>
  </div>
</template>

<style scoped>
.pp {
  position: fixed;
  z-index: 110;
  box-sizing: border-box;
  width: 320px;
  border: var(--border-width-base, 1px) solid var(--border-color-subtle, #c8ccd1);
  border-radius: var(--border-radius-base, 2px);
  background-color: var(--background-color-base, #fff);
  box-shadow: 0 30px 90px -20px rgba(0, 0, 0, 0.3), 0 0 1px 1px rgba(0, 0, 0, 0.05);
  color: var(--color-base, #202122);
  font-family: var(--font-family-system-sans, sans-serif);
  text-align: start;
  animation: pp-in 120ms ease-out;
}
.pp--above {
  transform: translateY(-100%);
}
.pp--portrait {
  width: 450px;
}
.pp--reference {
  width: 360px;
}
/* The pointer towards the link (Wikipedia's "pokey"). */
.pp::before,
.pp::after {
  content: '';
  position: absolute;
  inset-inline-start: var(--pp-poke);
  width: 0;
  height: 0;
  border: 8px solid transparent;
}
.pp--below::before {
  top: -17px;
  border-bottom-color: var(--border-color-subtle, #c8ccd1);
}
.pp--below::after {
  top: -16px;
  border-bottom-color: var(--background-color-base, #fff);
}
.pp--above::before {
  bottom: -17px;
  border-top-color: var(--border-color-subtle, #c8ccd1);
}
.pp--above::after {
  bottom: -16px;
  border-top-color: var(--background-color-base, #fff);
}
.pp--below.pp--page:not(.pp--portrait):has(.pp__thumb)::after {
  border-bottom-color: transparent;
}
@keyframes pp-in {
  from {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pp {
    animation: none;
  }
}
.pp__body {
  display: flex;
  flex-direction: column;
  color: inherit;
  text-decoration: none;
}
.pp__body:hover {
  text-decoration: none;
}
.pp--portrait .pp__body {
  flex-direction: row-reverse;
  align-items: flex-start;
}
/* Landscape: the lead image across the top; portrait: beside the text. */
.pp__thumb {
  display: block;
  width: 100%;
  height: 192px;
  object-fit: cover;
  border-start-start-radius: var(--border-radius-base, 2px);
  border-start-end-radius: var(--border-radius-base, 2px);
}
.pp--portrait .pp__thumb {
  flex: none;
  width: 203px;
  height: 250px;
  border-radius: 0 var(--border-radius-base, 2px) var(--border-radius-base, 2px) 0;
}
.pp__extract {
  position: relative;
  flex: 1;
  max-height: calc(7 * 1.6em);
  margin: 16px 16px 20px;
  overflow: hidden;
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: break-word;
}
.pp__extract :deep(p) {
  margin: 0;
}
/* The fade where the extract is cut. */
.pp__extract::after {
  content: '';
  position: absolute;
  inset-block-end: 0;
  inset-inline-end: 0;
  width: 25%;
  height: 1.6em;
  background: linear-gradient(to right, transparent, var(--background-color-base, #fff) 50%);
}
.pp__extract--generic::after {
  display: none;
}
.pp__head {
  padding: 16px 16px 8px;
  color: var(--color-subtle, #54595d);
  font-size: 12px;
  font-weight: var(--font-weight-bold, 700);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.pp__ref {
  max-height: 248px;
  padding: 0 16px 16px;
  overflow-y: auto;
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: break-word;
}
.pp__ref :deep(a) {
  color: var(--color-progressive, #36c);
}
</style>
