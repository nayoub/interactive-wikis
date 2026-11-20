<script setup lang="ts">
/**
 * The general visual tool: the article is the interface. Insert → Visual (or
 * a suggestion card) asks what to pick; that kind lights up in the section,
 * the rest dims; an empty block appears beside its source and the visual
 * grows in it with every pick. One slim bar at the bottom: count, miniature,
 * Undo, More, Cancel, Done. Labels are spans of their sentences, adjusted in
 * the text. No side panel, no list, no dropdown.
 */
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch,
} from 'vue'
import {
  CdxButton,
  CdxDialog,
  CdxIcon,
  CdxMenuButton,
  CdxMessage,
  CdxProgressBar,
} from '@wikimedia/codex'
import {
  cdxIconArrowUp,
  cdxIconChart,
  cdxIconDraggable,
  cdxIconEllipsis,
} from '@wikimedia/codex-icons'

import ArticleRenderer from '@/components/article/ArticleRenderer.vue'
import ArticleWrapper from '@/components/article/ArticleWrapper.vue'
import ChromeWrapper from '@/components/chrome/ChromeWrapper.vue'
import VeToolbar from '@/components/visual-editor/VeToolbar.vue'
import VisualEditorPageLayout from '@/components/visual-editor/VisualEditorPageLayout.vue'
import { globalSkin } from '@/theme'

import ImagePicker from '../curate/ImagePicker.vue'
import { hub, type HubId } from '../host/hub'
import { loadArticle, type ArticleSource, type LoadedArticle } from '../host/loadArticle'
import PrototypeMenu from '../host/PrototypeMenu.vue'
import type { ModulesStore, PlacedModule } from '../host/store'
import { setDayFirst } from '../model/dates'
import type { EventImage, ModuleKind, Placement } from '../model/types'
import type { FormId, Item } from '../model/visual'
import { scrollToEl, showPassage } from '../pick/passage'
import { END_MATTER } from '../pick/textIndex'
import { useSelectMode } from '../pick/useSelectMode'
import { cards, dismiss, dismissed } from './cards'
import ColumnsDialog from './ColumnsDialog.vue'
import {
  chooseValueColumn,
  emptyDraft,
  itemsOf,
  pickImage,
  pickStateOf,
  pickTable,
  refreshForm,
  setRole,
  setSpan,
  tableOf,
  toggleMention,
  type PickFilter,
  type PlacedVisual,
  type VisualDraft,
} from './draft'
import EditorBar from './EditorBar.vue'
import { defaultsOf, FORMS } from './forms'
import KindChooser from './KindChooser.vue'
import { formsFor } from './rules'
import SuggestionLayer from './SuggestionLayer.vue'
import { useSpanEditor } from './useSpanEditor'
import VisualFrame from './VisualFrame.vue'

type Kind = Exclude<PickFilter, 'all'>

const props = defineProps<{
  store: ModulesStore
  source: ArticleSource
  hubId: HubId
  example: () => Promise<Partial<Record<ModuleKind, PlacedModule>>>
  forceSkin?: 'desktop' | 'mobile'
}>()
const state = props.store.state
const skin = computed(() => props.forceSkin ?? globalSkin.value)
const isMobile = computed(() => skin.value === 'mobile')
const editing = computed(() => state.mode === 'edit')
const draft = computed(() => state.vdraft)
const picking = computed(() => editing.value && state.panelOpen && !!state.vdraft)
const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const vw = ref(typeof window === 'undefined' ? 1280 : window.innerWidth)
const onResize = () => (vw.value = window.innerWidth)
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
const narrow = computed(() => isMobile.value || vw.value < 640)

// ── Article ────────────────────────────────────────────────────────────────
const article = shallowRef<LoadedArticle | null>(null)
const loadError = ref<string | null>(null)
loadArticle(props.source)
  .then((a) => {
    setDayFirst(a.dayFirst)
    article.value = a
  })
  .catch((e) => (loadError.value = String(e?.message ?? e)))
const sections = computed(() =>
  (article.value?.sections ?? []).filter((s) => !END_MATTER.has(s.id)),
)
const bodyEl = ref<HTMLElement | null>(null)
const pageEl = ref<HTMLElement | null>(null)
function setBodyEl(el: unknown) {
  const next = (el as HTMLElement | null) ?? null
  if (next !== bodyEl.value) bodyEl.value = next
}
const topOf = (sectionId: string) =>
  article.value?.topSection[sectionId] ?? { id: sectionId, title: sectionId }
/** The top-level <section> element of an h2 id. */
const sectionEl = (id: string | null | undefined) =>
  id
    ? (bodyEl.value?.querySelector(`#${CSS.escape(id)}`)?.closest('section') as HTMLElement | null)
    : null
/** The h2 section an element sits in. */
function sectionIdOf(el: Element | null): string {
  let s = el?.closest('section') ?? null
  let id = 'Lead'
  while (s) {
    const h = s.querySelector<HTMLElement>(':scope > h2, :scope > .mw-heading > h2')
    if (h?.id) id = h.id
    s = s.parentElement?.closest('section') ?? null
  }
  return id
}

// ── Placed visuals: a mount per visual, placed without moving what you are reading ──
const mountEls = reactive<Record<string, HTMLElement | null>>({})
function insertAt(body: HTMLElement, mount: HTMLElement, p: Placement) {
  if (p.kind === 'after') {
    const anchor = body.querySelector(`#${CSS.escape(p.anchorId)}`)
    if (anchor?.parentElement)
      return void (anchor.nextElementSibling !== mount && anchor.after(mount))
  }
  const heading =
    body.querySelector<HTMLElement>(`#${CSS.escape(p.sectionId)}`) ?? body.querySelector('h2')
  if (!heading) return body.prepend(mount)
  const holder = heading.closest('.mw-heading') ?? heading
  const next = holder.nextElementSibling
  if (next?.classList.contains('protowiki-mobile-section-body')) {
    if (next.firstElementChild !== mount) next.prepend(mount)
  } else if (next !== mount) holder.after(mount)
}
function ensureMounts() {
  const body = bodyEl.value
  // Keep the text under the middle of the viewport where it is.
  const ref0 = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
  const keep = ref0 && body?.contains(ref0) && !ref0.closest('.tl-mount') ? ref0 : null
  const before = keep?.getBoundingClientRect().top ?? 0
  const live = new Set(state.visuals.map((v) => v.id))
  for (const id of Object.keys(mountEls)) {
    if (!live.has(id) || !body) {
      mountEls[id]?.remove()
      delete mountEls[id]
    }
  }
  if (!body) return
  for (const v of state.visuals) {
    let mount = mountEls[v.id] ?? null
    if (!mount || !body.contains(mount)) {
      mount = document.createElement('div')
      mount.className = 'tl-mount'
      mount.dataset.visual = v.id
      mount.setAttribute('contenteditable', 'false')
    }
    insertAt(body, mount, v.placement)
    mountEls[v.id] = mount
  }
  // An annotated image takes the place of its image (not while it is being made).
  body.querySelectorAll('.gm-replaced').forEach((el) => el.classList.remove('gm-replaced'))
  for (const v of state.visuals) {
    const img = v.pick?.imageId
    if (img && v.visual.form === 'annotated' && draft.value?.editingId !== v.id)
      body.querySelector(`[data-tl-id="${img}"]`)?.classList.add('gm-replaced')
  }
  if (keep) {
    const shift = keep.getBoundingClientRect().top - before
    if (Math.abs(shift) > 1) window.scrollBy(0, shift)
  }
}
watch(
  [bodyEl, () => state.visuals, skin, () => draft.value?.editingId],
  () => nextTick(ensureMounts),
  {
    deep: true,
    flush: 'post',
  },
)
watch(bodyEl, (el) => el && setTimeout(ensureMounts, 50))

// The block grows with every pick: when it sits above what the editor is reading, keep the text still.
let grow: ResizeObserver | null = null
let lastHeight = 0
watch(
  () => (picking.value && draft.value?.editingId ? mountEls[draft.value.editingId] : null),
  (mount) => {
    grow?.disconnect()
    grow = null
    if (!mount) return
    lastHeight = mount.getBoundingClientRect().height
    grow = new ResizeObserver(() => {
      const r = mount.getBoundingClientRect()
      const delta = r.height - lastHeight
      lastHeight = r.height
      if (delta && r.bottom < window.innerHeight * 0.3) window.scrollBy(0, delta)
    })
    grow.observe(mount)
  },
  { flush: 'post' },
)
onBeforeUnmount(() => grow?.disconnect())

// ── Which section the editor is in (caret, else the middle of the screen) ──
const caretSection = ref<string | null>(null)
function onSelectionChange() {
  if (!editing.value || picking.value) return
  const node = document.getSelection()?.anchorNode
  if (!node || !bodyEl.value?.contains(node)) return
  caretSection.value = sectionIdOf((node.nodeType === 1 ? node : node.parentElement) as Element)
}
onMounted(() => document.addEventListener('selectionchange', onSelectionChange))
onBeforeUnmount(() => document.removeEventListener('selectionchange', onSelectionChange))
function currentSection(): string {
  if (caretSection.value && caretSection.value !== 'Lead') return caretSection.value
  const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
  const id = el && bodyEl.value?.contains(el) ? sectionIdOf(el) : null
  return id && id !== 'Lead' ? id : props.source.defaultSection.id
}
function kindsIn(scope: string | null): Record<Kind, boolean> {
  const a = article.value
  const sec = sectionEl(scope)
  const inScope = (id: string) => !scope || topOf(id).id === scope
  return {
    date: !!a?.mentions.some((m) => inScope(m.anchor.sectionId)),
    place: !!a?.places.some((m) => m.value.kind !== 'region' && inScope(m.anchor.sectionId)),
    table: !!a?.tables.some((t) => inScope(t.value.sectionId)),
    image: !!(scope
      ? sec?.querySelector('.tl-pick-image')
      : bodyEl.value?.querySelector('.tl-pick-image')),
  }
}

// ── Getting in: Insert → Visual asks what to pick ──────────────────────────
const chooser = reactive({ open: false, anchor: null as HTMLElement | null, section: '' })
function onInsert(value: string) {
  if (value !== 'visual') return
  chooser.section = currentSection()
  chooser.anchor = document.querySelector<HTMLElement>('.ve-toolbar__menu-trigger, .ve-toolbar')
  chooser.open = true
}
const chooserTitle = computed(
  () => sections.value.find((s) => s.id === chooser.section)?.title ?? chooser.section,
)
function onChoose(kind: Kind, whole: boolean) {
  chooser.open = false
  start(kind, whole ? null : chooser.section)
}

let ids = 0
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
const snapshot = (d: VisualDraft) =>
  JSON.stringify({
    visual: d.visual,
    tableId: d.tableId,
    roles: d.roles,
    imageId: d.imageId,
    compareWith: d.compareWith,
    question: d.question,
    currentId: d.currentId,
  })
function record() {
  if (!draft.value) return
  undoStack.value.push(snapshot(draft.value))
  redoStack.value = []
}
function restore(json: string) {
  if (!draft.value) return
  Object.assign(draft.value, JSON.parse(json))
}
function undo() {
  const d = draft.value
  const prev = undoStack.value.pop()
  if (!d || !prev) return
  redoStack.value.push(snapshot(d))
  restore(prev)
  announce('Undone')
}
function redo() {
  const d = draft.value
  const next = redoStack.value.pop()
  if (!d || !next) return
  undoStack.value.push(snapshot(d))
  restore(next)
}

/** Enter the mode: an empty block beside the source, that kind lit in that section. */
function start(kind: Kind, scope: string | null) {
  const id = `v${Date.now().toString(36)}${++ids}`
  const sec = scope ?? currentSection()
  const placement: Placement = {
    kind: 'sectionTop',
    sectionId: sec,
    sectionTitle: topOf(sec).title,
  }
  state.visuals = [...state.visuals, { id, visual: emptyDraft(kind).visual, placement }]
  state.vdraft = {
    ...emptyDraft(kind),
    editingId: id,
    isNew: true,
    scope,
    currentId: null,
    question: null,
  }
  undoStack.value = []
  redoStack.value = []
  state.panelOpen = true
  ;(document.activeElement as HTMLElement | null)?.blur?.()
  document.getSelection()?.removeAllRanges()
  announce(`Making a visual. ${PROMPT[kind]}.`)
}

/** Clicking a placed visual in edit mode: the same mode, its section lit, its items picked. */
function reEnter(id: string) {
  const v = state.visuals.find((x) => x.id === id)
  if (!v || picking.value) return
  const p = v.pick
  state.vdraft = {
    ...emptyDraft(p?.kind ?? 'all'),
    visual: JSON.parse(JSON.stringify(v.visual)),
    tableId: p?.tableId ?? null,
    roles: [...(p?.roles ?? [])],
    imageId: p?.imageId ?? null,
    compareWith: p?.compareWith ?? null,
    editingId: id,
    isNew: false,
    scope: p?.scope ?? null,
    currentId: null,
    question: null,
  }
  undoStack.value = []
  redoStack.value = []
  state.panelOpen = true
}

function done() {
  const d = draft.value
  if (!d?.editingId) return
  const id = d.editingId
  state.visuals = state.visuals.map((v) =>
    v.id === id ? { ...v, visual: JSON.parse(JSON.stringify(d.visual)), pick: pickStateOf(d) } : v,
  )
  state.fromExample = false
  state.vdraft = null
  state.panelOpen = false
  selectedBlock.value = id
  announce('Visual placed.')
}
const confirmCancel = ref(false)
function cancel(force = false) {
  const d = draft.value
  if (!d) return
  if (!force && undoStack.value.length) {
    confirmCancel.value = true
    return
  }
  confirmCancel.value = false
  if (d.isNew) state.visuals = state.visuals.filter((v) => v.id !== d.editingId)
  state.vdraft = null
  state.panelOpen = false
  announce(d.isNew ? 'Visual discarded.' : 'Changes discarded.')
}
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !picking.value || e.defaultPrevented) return
  // Not while a popover, dialog or menu is open (Escape closes that first).
  const open = document.querySelectorAll<HTMLElement>('.cdx-popover, .cdx-dialog, .cdx-menu')
  if ([...open].some((el) => el.offsetParent !== null)) return
  const t = e.target instanceof Element ? e.target : null
  if (t?.closest('input, [contenteditable="true"], [contenteditable="plaintext-only"]')) return
  cancel()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// ── Spotlight: one kind, one section ───────────────────────────────────────
const PROMPT: Record<Kind, string> = {
  date: 'Tap a date in the text',
  place: 'Tap a place in the text',
  table: 'Tap “Use this” on a table',
  image: 'Tap “Use this” on an image',
}
const litKind = computed(() => (picking.value && draft.value ? draft.value.filter : null))
const scopeId = computed(() => (picking.value ? (draft.value?.scope ?? null) : null))
watch(
  [scopeId, bodyEl, picking],
  () => {
    bodyEl.value?.querySelectorAll('.gm-scope').forEach((el) => el.classList.remove('gm-scope'))
    sectionEl(scopeId.value)?.classList.add('gm-scope')
  },
  { flush: 'post' },
)
const pickedIds = computed(() => {
  const d = draft.value
  if (!d) return new Set<string>()
  return new Set([...itemsOf(d).map((i) => i.id), d.tableId ?? '', d.imageId ?? ''].filter(Boolean))
})
function toggle(id: string) {
  const d = draft.value
  const a = article.value
  if (!d || !a) return
  const from = bodyEl.value?.querySelector<HTMLElement>(`[data-tl-id="${CSS.escape(id)}"]`) ?? null
  const had = pickedIds.value.has(id)
  record()
  if (a.tables.some((t) => t.id === id)) {
    pickTable(d, a, id)
    const t = tableOf(a, d.tableId)
    // Directly after its table.
    if (t) placeAfter(d.editingId!, t.el.id, t.sectionId)
  } else if (/^img\d+$/.test(id)) {
    pickImage(d, a, id)
    d.visual.form = 'annotated'
    // In place of its image.
    const fig = bodyEl.value?.querySelector<HTMLElement>(`[data-tl-id="${id}"]`)
    if (fig?.id) placeAfter(d.editingId!, fig.id, sectionIdOf(fig))
  } else {
    toggleMention(d, a, id)
    d.currentId = had ? null : id
  }
  if (!had && from) fly(from)
  const n = itemsOf(d).length
  const def = FORMS[d.visual.form]
  announce(
    had
      ? `Removed. ${n} ${n === 1 ? def.noun[0] : def.noun[1]}.`
      : `Added. ${n} ${n === 1 ? def.noun[0] : def.noun[1]}.`,
  )
}
function placeAfter(id: string, anchorId: string, sectionId: string) {
  state.visuals = state.visuals.map((v) =>
    v.id === id
      ? {
          ...v,
          placement: { kind: 'after', anchorId, sectionId, sectionTitle: topOf(sectionId).title },
        }
      : v,
  )
}
useSelectMode({
  root: bodyEl,
  active: picking,
  kind: litKind,
  picked: pickedIds,
  toggle,
  describe: (id) =>
    pickedIds.value.has(id) ? 'On the visual: tap to remove' : 'Tap to add to the visual',
  sentenceOf: (id) => {
    const m = [...(article.value?.mentions ?? []), ...(article.value?.places ?? [])].find(
      (x) => x.id === id,
    )
    return m ? { start: m.anchor.sentenceStart, end: m.anchor.sentenceEnd } : null
  },
  within: (el) => {
    const sec = sectionEl(scopeId.value)
    return !sec || sec.contains(el)
  },
  scope: scopeId,
})
function onTableClick(e: MouseEvent) {
  if (!picking.value || litKind.value !== 'table') return
  const t = (e.target as Element).closest<HTMLElement>('table[data-pick-table]')
  if (!t || (e.target as Element).closest('.tl-mention')) return
  const sec = sectionEl(scopeId.value)
  if (sec && !sec.contains(t)) return
  e.preventDefault()
  toggle(t.dataset.pickTable!)
}
watch(bodyEl, (el, old) => {
  old?.removeEventListener('click', onTableClick)
  el?.addEventListener('click', onTableClick)
})

/** One short transition from the chip to the block (none with reduced motion). */
function fly(from: HTMLElement) {
  const to = draft.value?.editingId ? mountEls[draft.value.editingId] : null
  if (reducedMotion || !to) return
  const a = from.getBoundingClientRect()
  const b = to.getBoundingClientRect()
  const ghost = document.createElement('div')
  ghost.className = 'gm-fly'
  ghost.textContent = from.textContent?.slice(0, 40) ?? ''
  Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px` })
  document.body.appendChild(ghost)
  const dy = Math.max(-window.innerHeight, Math.min(window.innerHeight, b.top + 24 - a.top))
  ghost
    .animate(
      [
        { transform: 'translate(0, 0)', opacity: 1 },
        { transform: `translate(${b.left + 24 - a.left}px, ${dy}px) scale(0.6)`, opacity: 0 },
      ],
      { duration: 200, easing: 'ease-in' },
    )
    .finished.finally(() => ghost.remove())
}

// ── The bar ────────────────────────────────────────────────────────────────
const items = computed(() => (draft.value ? itemsOf(draft.value) : []))
const fits = computed<FormId[]>(() => formsFor(items.value))
const currentItem = computed(() => items.value.find((i) => i.id === draft.value?.currentId) ?? null)
const columnsOpen = ref(false)
function onMore(action: string) {
  const d = draft.value
  const a = article.value
  if (!d || !a) return
  if (action === 'whole') d.scope = null
  else if (action === 'section') d.scope = currentSection()
  else if (action === 'addAll') addAll()
  else if (action === 'columns') columnsOpen.value = true
  else if (action.startsWith('setting:')) {
    const key = action.slice(8)
    const s = FORMS[d.visual.form].settings?.find((x) => x.key === key)
    record()
    d.visual.options[key] = !(d.visual.options[key] !== undefined
      ? d.visual.options[key]
      : s?.default)
  } else if (action.startsWith('form:')) chooseForm(action.slice(5) as FormId)
}
function chooseForm(f: FormId) {
  const d = draft.value
  if (!d) return
  record()
  d.visual.form = f
  d.visual.options = { ...defaultsOf(f), ...d.visual.options }
}
function addAll() {
  const d = draft.value
  const a = article.value
  if (!d || !a || (d.filter !== 'date' && d.filter !== 'place')) return
  record()
  const scope = d.scope
  const list = d.filter === 'date' ? a.mentions : a.places.filter((p) => p.value.kind !== 'region')
  const seen = new Set<string>()
  for (const m of list) {
    if (scope && topOf(m.anchor.sectionId).id !== scope) continue
    if (pickedIds.value.has(m.id) || seen.has(m.sentence + m.text)) continue
    seen.add(m.sentence + m.text)
    toggleMention(d, a, m.id)
  }
  announce(`Added all. ${itemsOf(d).length} items.`)
}
function answer(col: number) {
  const d = draft.value
  if (!d || !article.value) return
  record()
  chooseValueColumn(d, article.value, col)
}
function onRole(col: number, role: Parameters<typeof setRole>[3]) {
  const d = draft.value
  if (!d || !article.value) return
  record()
  setRole(d, article.value, col, role)
}
function toBlock() {
  const id = draft.value?.editingId
  const m = id ? mountEls[id] : null
  if (m) scrollToEl(m, 'start', 72)
}

// ── Labels: spans of the sentence, adjusted in the text ────────────────────
useSpanEditor({
  root: bodyEl,
  item: currentItem,
  active: picking,
  begin: record,
  change: (span) => currentItem.value && setSpan(currentItem.value, span),
})

// ── Edit on the visual ─────────────────────────────────────────────────────
const findItem = (id: string) => items.value.find((i) => i.id === id)
function onRename(id: string, label: string) {
  const it = findItem(id)
  if (!it) return
  record()
  it.label = label
  it.labelEdited = true
}
function onRemove(id: string) {
  const d = draft.value
  if (!d) return
  record()
  d.visual.sets[0].items = itemsOf(d).filter((i) => i.id !== id)
  if (d.currentId === id) d.currentId = null
  refreshForm(d)
  announce('Removed.')
}
function onMove(id: string, delta: number) {
  const list = items.value
  const i = list.findIndex((x) => x.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= list.length) return
  record()
  list.splice(j, 0, list.splice(i, 1)[0])
}
function onReorder(order: string[]) {
  const d = draft.value
  if (!d) return
  const by = new Map(itemsOf(d).map((i) => [i.id, i]))
  d.visual.sets[0].items = order.map((id) => by.get(id)!).filter(Boolean)
}
function onSelectItem(id: string | null) {
  const d = draft.value
  if (d && id && findItem(id)?.source.span) d.currentId = id
}
const imageFor = ref<string | null>(null)
const imageOpen = computed({
  get: () => !!imageFor.value,
  set: (v: boolean) => !v && (imageFor.value = null),
})
const imageItem = computed(() => {
  const it = imageFor.value ? findItem(imageFor.value) : null
  return it
    ? {
        id: it.id,
        label: it.label,
        sourceText: it.source.text,
        sourceDateText: '',
        image: it.image,
        date: it.components.time,
      }
    : null
})
function onImage(img: EventImage | undefined) {
  const it = imageFor.value ? findItem(imageFor.value) : null
  if (!it) return
  record()
  it.image = img
}
function showSource(item: Item) {
  if (bodyEl.value && item.source.anchor)
    showPassage(
      bodyEl.value,
      item.source.anchor,
      item.source.kind === 'sentence' ? item.source.text : undefined,
    )
}

// ── Blocks: select, drag to place, move on a phone ─────────────────────────
const selectedBlock = ref<string | null>(null)
const shownVisual = (v: PlacedVisual) =>
  draft.value?.editingId === v.id ? draft.value.visual : v.visual
function onBlockClick(v: PlacedVisual, e: MouseEvent) {
  if (!editing.value || picking.value) return
  if ((e.target as Element).closest('.gm-block__tools')) return
  reEnter(v.id)
}
/** Gaps between the article's blocks: where a visual can go. */
function gaps() {
  const body = bodyEl.value
  if (!body) return []
  const blocks = Array.from(
    body.querySelectorAll<HTMLElement>(
      'section > :is(p, ul, ol, figure, table, div, blockquote, dl)',
    ),
  ).filter(
    (el) =>
      !el.closest('.tl-mount') &&
      !el.matches('.tl-mount, .tl-table-pick, .mw-heading') &&
      el.offsetParent,
  )
  return blocks
}
let blockSeq = 0
const ensureId = (el: HTMLElement) => (el.id ||= `gm-blk-${++blockSeq}`)
const drop = reactive({ on: false, y: 0, left: 0, width: 0, target: null as HTMLElement | null })
function onHandleDown(v: PlacedVisual, e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  const handle = e.currentTarget as HTMLElement
  handle.setPointerCapture(e.pointerId)
  const list = gaps()
  const move = (ev: PointerEvent) => {
    let best: HTMLElement | null = null
    let d = Infinity
    for (const el of list) {
      const r = el.getBoundingClientRect()
      const dd = Math.abs(r.bottom - ev.clientY)
      if (dd < d) {
        d = dd
        best = el
      }
    }
    if (!best) return
    const r = best.getBoundingClientRect()
    Object.assign(drop, { on: true, y: r.bottom + 4, left: r.left, width: r.width, target: best })
  }
  const up = () => {
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', up)
    handle.removeEventListener('pointercancel', up)
    if (drop.target) placeAfter(v.id, ensureId(drop.target), sectionIdOf(drop.target))
    drop.on = false
    drop.target = null
    state.fromExample = false
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', up)
  handle.addEventListener('pointercancel', up)
}
function moveBlock(v: PlacedVisual, delta: number) {
  const mount = mountEls[v.id]
  const list = gaps()
  if (!mount) return
  // The block just before the mount, then one further up or down.
  const before = list.filter(
    (el) => el.compareDocumentPosition(mount) & Node.DOCUMENT_POSITION_FOLLOWING,
  )
  const i = before.length - 1
  const target = list[Math.max(0, Math.min(list.length - 1, i + delta))]
  if (target) placeAfter(v.id, ensureId(target), sectionIdOf(target))
  state.fromExample = false
  nextTick(() => setTimeout(() => mountEls[v.id] && scrollToEl(mountEls[v.id]!, 'center'), 60))
}
function blockMenu(v: PlacedVisual) {
  return [
    { value: 'edit', label: 'Edit' },
    { value: 'up', label: 'Move up' },
    { value: 'down', label: 'Move down' },
    { value: 'remove', label: 'Remove' },
  ].filter(() => !!v)
}
function onBlockMenu(v: PlacedVisual, action: string | null) {
  if (action === 'edit') reEnter(v.id)
  else if (action === 'up') moveBlock(v, -1)
  else if (action === 'down') moveBlock(v, 1)
  else if (action === 'remove') {
    state.visuals = state.visuals.filter((x) => x.id !== v.id)
    state.fromExample = false
  }
}

// ── Suggestion cards ───────────────────────────────────────────────────────
const gone = ref(dismissed())
watch(
  () => hub.suggestionsReset,
  () => (gone.value = dismissed()),
)
const shownCards = computed(() =>
  editing.value && !picking.value && hub.suggestions && article.value
    ? cards(article.value, state.visuals, gone.value)
    : [],
)
function onDismiss(c: { id: string }, reason: string) {
  dismiss(c.id, reason)
  gone.value = dismissed()
  announce('Suggestion dismissed.')
}

// ── Reader: jump to source and back ────────────────────────────────────────
const backTo = ref<string | null>(null)
let jumpedAt = 0
function jumpToSource(id: string, item: Item) {
  if (!bodyEl.value || !item.source.anchor) return
  if (
    showPassage(
      bodyEl.value,
      item.source.anchor,
      item.source.kind === 'sentence' ? item.source.text : undefined,
    )
  ) {
    backTo.value = id
    jumpedAt = Date.now()
  }
}
function backToVisual() {
  const id = backTo.value
  backTo.value = null
  const m = id ? mountEls[id] : null
  if (m) scrollToEl(m, 'start', 72)
}
function onScroll() {
  const m = backTo.value ? mountEls[backTo.value] : null
  if (!m || Date.now() - jumpedAt < 1500) return
  const r = m.getBoundingClientRect()
  if (r.bottom > 0 && r.top < window.innerHeight * 0.6) backTo.value = null
}
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
watch(
  () => state.signal.n,
  () => {
    backTo.value = null
    if (state.signal.kind === 'top') window.scrollTo({ top: 0 })
    else if (state.visuals[0])
      nextTick(() =>
        setTimeout(
          () =>
            mountEls[state.visuals[0].id] &&
            scrollToEl(mountEls[state.visuals[0].id]!, 'start', 56),
          80,
        ),
      )
  },
)
watch(editing, (on) => {
  if (!on) {
    selectedBlock.value = null
    if (picking.value) cancel(true)
  }
})

const live = ref('')
function announce(t: string) {
  live.value = ''
  requestAnimationFrame(() => (live.value = t))
}
const languages = computed(() =>
  article.value?.labelLanguages.length
    ? [{ value: 'en', label: 'English' }, ...article.value.labelLanguages]
    : [],
)
const insertItems = [{ value: 'visual', label: 'Visual', icon: cdxIconChart }]
const prompt = computed(() => (draft.value ? (PROMPT[draft.value.filter as Kind] ?? '') : ''))
</script>

<template>
  <ChromeWrapper
    :skin="props.forceSkin"
    :show-footer="!(isMobile && editing)"
    :last-edited-notice="false"
    tag="Prototype"
  >
    <template v-if="isMobile && editing" #header><span /></template>
    <template #user-menu>
      <PrototypeMenu
        :current="hubId"
        :kinds="['timeline']"
        :store="store"
        :example="example"
        :skin="isMobile ? 'mobile' : 'desktop'"
        :languages="languages"
        suggestion-controls
      />
    </template>

    <VisualEditorPageLayout :sidebar-open="false" :editing="editing" :skin="skin">
      <div
        ref="pageEl"
        class="tl-page gm"
        :class="{
          'tl-page--editing': editing,
          'tl-page--selecting': picking,
          'gm--picking': picking,
          'gm--scoped': picking && !!scopeId,
          'tl-page--tables': picking && litKind === 'table',
          'gm--images': picking && litKind === 'image',
        }"
        :data-skin="skin"
      >
        <div class="tl-page__main">
          <ArticleWrapper
            :title="source.title"
            :skin="props.forceSkin"
            :active-view="editing ? 'edit' : 'read'"
            @read-click="state.mode = 'read'"
            @edit-click="state.mode = 'edit'"
          >
            <VeToolbar
              v-if="editing && !picking"
              :skin="skin"
              :suggestions-on="false"
              :count="0"
              :show-suggestions-toggle="false"
              :can-undo="false"
              :can-redo="false"
              :can-publish="state.visuals.length > 0"
              :review="false"
              :insert-items="insertItems"
              @insert="onInsert"
              @close="state.mode = 'read'"
              @publish="state.mode = 'read'"
            />
            <VeToolbar
              v-else-if="picking && !narrow"
              :skin="skin"
              :suggestions-on="false"
              :count="0"
              :show-suggestions-toggle="false"
              :can-undo="undoStack.length > 0"
              :can-redo="redoStack.length > 0"
              :can-publish="false"
              :review="false"
              :insert-items="[]"
              @undo="undo"
              @redo="redo"
              @close="cancel()"
            />
            <CdxProgressBar v-if="!article && !loadError" inline aria-label="Loading article" />
            <CdxMessage v-if="loadError" type="error"
              >Could not load the article snapshot: {{ loadError }}</CdxMessage
            >
            <ArticleRenderer v-if="article" :skin="props.forceSkin">
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div
                :ref="setBodyEl"
                class="tl-body"
                :contenteditable="editing && !picking ? 'true' : 'false'"
                spellcheck="false"
                v-html="article.html"
              />
            </ArticleRenderer>
          </ArticleWrapper>
        </div>
        <SuggestionLayer
          v-if="shownCards.length"
          :cards="shownCards"
          :root="bodyEl"
          :page="pageEl"
          :skin="narrow ? 'mobile' : 'desktop'"
          @start="(c) => start(c.kind, c.section.id)"
          @dismiss="onDismiss"
        />
      </div>
    </VisualEditorPageLayout>

    <template v-for="v in state.visuals" :key="v.id">
      <Teleport v-if="mountEls[v.id]" :to="mountEls[v.id]!">
        <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/no-static-element-interactions -->
        <div
          class="gm-block"
          :class="{
            'gm-block--editing': editing,
            'gm-block--active': draft?.editingId === v.id,
            'gm-block--selected': selectedBlock === v.id && !picking,
            'gm-block--other': picking && draft?.editingId !== v.id,
          }"
          @click="onBlockClick(v, $event)"
        >
          <div v-if="editing && !picking" class="gm-block__tools">
            <button
              v-if="!narrow"
              type="button"
              class="gm-block__handle"
              aria-label="Drag to move this visual"
              @pointerdown="onHandleDown(v, $event)"
            >
              <CdxIcon :icon="cdxIconDraggable" size="small" />
            </button>
            <CdxMenuButton
              :selected="null"
              :menu-items="blockMenu(v)"
              weight="quiet"
              size="small"
              aria-label="Visual options"
              @update:selected="(a: string | null) => onBlockMenu(v, a)"
            >
              <CdxIcon :icon="cdxIconEllipsis" size="small" />
            </CdxMenuButton>
          </div>
          <VisualFrame
            :visual="shownVisual(v)"
            :fallback="hub.fallback"
            :lang="hub.lang"
            :skin="skin"
            :spacing="state.spacing"
            :editing="draft?.editingId === v.id && picking"
            :prompt="prompt"
            :focus-id="draft?.editingId === v.id ? draft?.currentId : null"
            :can-show-source="!picking"
            @show="(item: Item) => (picking ? showSource(item) : jumpToSource(v.id, item))"
            @select="onSelectItem"
            @rename="onRename"
            @remove="onRemove"
            @image="(id: string) => (imageFor = id)"
            @move="onMove"
            @reorder="onReorder"
          />
        </div>
      </Teleport>
    </template>

    <EditorBar
      v-if="picking && draft"
      :visual="draft.visual"
      :items="items"
      :fits="fits"
      :question="draft.question ?? null"
      :can-undo="undoStack.length > 0"
      :prompt="prompt"
      :scoped="!!draft.scope"
      :can-add-all="draft.filter === 'date' || draft.filter === 'place'"
      :is-table="!!draft.tableId"
      :narrow="narrow"
      @undo="undo"
      @cancel="cancel()"
      @done="done"
      @to-block="toBlock"
      @answer="answer"
      @form="chooseForm"
      @more="onMore"
    />

    <KindChooser
      v-if="article"
      v-model:open="chooser.open"
      :anchor="chooser.anchor"
      :section="chooserTitle"
      :kinds="kindsIn(chooser.section)"
      :anywhere="kindsIn(null)"
      @choose="onChoose"
    />
    <ColumnsDialog
      v-if="draft && article"
      v-model:open="columnsOpen"
      :table="tableOf(article, draft.tableId)"
      :roles="draft.roles"
      @role="onRole"
    />
    <ImagePicker
      v-if="article"
      v-model:open="imageOpen"
      :images="article.images"
      :event="imageItem"
      :subject="article.source.title"
      @choose="onImage"
    />
    <CdxDialog
      v-model:open="confirmCancel"
      title="Discard this visual?"
      :use-close-button="true"
      :primary-action="{ label: 'Discard', actionType: 'destructive' }"
      :default-action="{ label: 'Keep making it' }"
      @primary="cancel(true)"
      @default="confirmCancel = false"
    >
      Your picks since you started will be lost.
    </CdxDialog>

    <div
      v-if="drop.on"
      class="gm-drop"
      :style="{ top: `${drop.y}px`, left: `${drop.left}px`, width: `${drop.width}px` }"
    />
    <div v-if="backTo && !editing" class="gm__back" :class="{ 'gm__back--mobile': isMobile }">
      <CdxButton action="progressive" @click="backToVisual"
        ><CdxIcon :icon="cdxIconArrowUp" /> Back to visual</CdxButton
      >
    </div>
    <span class="gm__sr" aria-live="polite">{{ live }}</span>
  </ChromeWrapper>
</template>

<style scoped>
.tl-page {
  position: relative;
  display: flex;
  align-items: flex-start;
}
.tl-page__main {
  flex: 1;
  min-width: 0;
}
.tl-page[data-skin='mobile'] {
  overflow-x: clip;
}
/* The bar never covers the last line. */
.gm--picking {
  padding-bottom: 140px;
}
.gm__back {
  position: fixed;
  left: 50%;
  bottom: var(--spacing-150);
  transform: translateX(-50%);
  z-index: 90;
}
.gm__back--mobile {
  bottom: 64px;
}
.gm__back :deep(.cdx-button) {
  background-color: var(--background-color-base);
}
.gm__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.gm-drop {
  position: fixed;
  z-index: 130;
  height: 0;
  border-top: var(--border-width-thick, 2px) solid var(--border-color-progressive);
  pointer-events: none;
}
</style>

<!-- The article while a visual is being made (v-html body, so unscoped). -->
<style>
/* Spotlight: the section in use stays; the rest of the article recedes further. */
.gm.gm--picking .mw-parser-output > section,
.gm.gm--picking .mw-parser-output > p,
.gm.gm--picking .mw-parser-output > figure,
.gm.gm--picking .mw-parser-output > table {
  transition: opacity 200ms;
}
.gm.gm--scoped
  .mw-parser-output
  section:not(.gm-scope):not(.gm-scope section):not(:has(.gm-scope)) {
  opacity: 0.25;
}
.gm.gm--picking .tl-mount {
  opacity: 1 !important;
}
@media (prefers-reduced-motion: reduce) {
  .gm.gm--picking .mw-parser-output > section {
    transition: none;
  }
}
/* An image in use: outline and one "Use this". */
.gm.gm--images .mw-parser-output .tl-pick-image.tl-mention--candidate {
  position: relative;
  opacity: 1;
  margin: 0;
  padding: 0;
  background: none;
  outline: var(--border-width-base, 1px) solid var(--border-color-progressive);
  outline-offset: 2px;
  cursor: pointer;
}
.gm.gm--images .mw-parser-output .tl-pick-image.tl-mention--candidate img {
  opacity: 1;
}
.gm.gm--images .mw-parser-output .tl-pick-image.tl-mention--candidate::after {
  content: 'Use this';
  position: absolute;
  top: var(--spacing-50);
  left: var(--spacing-50);
  padding: var(--spacing-25) var(--spacing-75);
  border-radius: var(--border-radius-base, 2px);
  background: var(--background-color-progressive-subtle);
  color: var(--color-progressive);
  font-family: var(--font-family-base);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
}
.gm.gm--images .mw-parser-output .tl-pick-image.tl-mention--picked {
  outline-width: var(--border-width-thick, 2px);
}
.gm.gm--images .mw-parser-output .tl-pick-image.tl-mention--picked::after {
  content: 'In use';
  background: var(--background-color-progressive);
  color: var(--color-inverted-fixed, #fff);
}
.gm.tl-page--selecting:not(.gm--images) .mw-parser-output .tl-pick-image {
  opacity: 0.35;
}
.gm .mw-parser-output .gm-replaced {
  display: none;
}

/* The block: hover tools in edit mode; the block being made; a placed one just finished. */
.gm-block {
  position: relative;
  transition: opacity 200ms;
}
.gm-block--editing:not(.gm-block--active) {
  cursor: pointer;
}
.gm-block--editing:not(.gm-block--active):hover,
.gm-block--selected {
  outline: var(--border-width-base, 1px) solid var(--border-color-progressive);
  outline-offset: 4px;
}
.gm-block--active {
  outline: var(--border-width-thick, 2px) solid var(--border-color-progressive);
  outline-offset: 6px;
}
.gm-block--other {
  opacity: 0.25;
}
.gm-block__tools {
  position: absolute;
  top: var(--spacing-50);
  right: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--background-color-base);
}
.gm-block__handle {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-subtle);
  cursor: grab;
  touch-action: none;
}
.gm-block__handle:active {
  cursor: grabbing;
}

/* The label span: underlined in its sentence (not a chip), with an end to drag at each side. */
.gm-span {
  position: absolute;
  inset: 0 auto auto 0;
  pointer-events: none;
  z-index: 6;
}
.gm-span__line {
  position: absolute;
  height: 0;
  border-top: var(--border-width-thick, 2px) solid var(--border-color-progressive);
  transform: translateY(1px);
}
.gm-span__handle {
  position: absolute;
  width: 12px;
  height: 22px;
  margin: -20px 0 0 -6px;
  padding: 0;
  border: 0;
  background: none;
  cursor: ew-resize;
  pointer-events: auto;
  touch-action: none;
}
.gm-span__handle::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 0;
  width: 2px;
  height: 22px;
  background: var(--background-color-progressive);
}
.gm-span__handle::after {
  content: '';
  position: absolute;
  left: 1px;
  bottom: -4px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--background-color-progressive);
}
.gm-span__handle:focus-visible {
  outline: var(--border-width-thick, 2px) solid var(--outline-color-progressive--focus, #36c);
}
.gm-fly {
  position: fixed;
  z-index: 140;
  padding: 1px 6px;
  border-radius: var(--border-radius-base, 2px);
  background: var(--background-color-progressive);
  color: var(--color-inverted-fixed, #fff);
  font-family: var(--font-family-base);
  font-size: var(--font-size-small);
  pointer-events: none;
  white-space: nowrap;
}
</style>
