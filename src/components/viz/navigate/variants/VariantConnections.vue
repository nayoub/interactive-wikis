<script setup lang="ts">
/**
 * 3 · Connections within the text. The article's words stay in their
 * paragraphs; an explicit "Show connections" list (below the introduction)
 * selects one thread, topic or relationship at a time. Ordinary links keep
 * their behaviour.
 *
 *   thread    same verified entity (same link target): ticks on a thin spine,
 *             no direction, mentions underlined in the text
 *   topic     editor-curated group: brackets with role labels on one spine,
 *             passages washed neutral
 *   relation  stated by the source: the two endpoints and, separately, the
 *             span whose words state it (shown as evidence, with its
 *             citation); an arrow only when the words give a direction
 *   together  mere co-mention: names underlined (dotted) in their sentence,
 *             one dotted bracket, no relationship drawn
 *
 *   connect-brackets  straight brackets in the margin
 *   connect-paths     fine curves from the text's edge through the margin
 *
 * Narrower than the margin needs: highlights in the text plus the
 * related-passages list; nothing depends on the lines.
 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CdxButton, CdxIcon, CdxToggleButton } from '@wikimedia/codex'
import { cdxIconArrowDown, cdxIconArrowUp, cdxIconClose, cdxIconEye } from '@wikimedia/codex-icons'

import { CONNECTIONS, ROLE_LABEL, type ConnectionRec, type RelationRec, type TogetherRec, type TopicRec } from '../connections'
import { NAV, type NavContext } from '../context'
import { msg } from '../messages'
import { locate, mentionsOf, repeatedTargets, spanIn, type Passage } from '../passages'
import ReturnBar from '../ReturnBar.vue'
import { obstructions } from '../useNavigator'

const ctx = inject(NAV) as NavContext & { leadMount: Ref<HTMLElement | null>; margin: Ref<'start' | 'end' | null> }
const nav = ctx.nav
const route = useRoute()
const router = useRouter()
const mode = computed(() => (ctx.variant === 'connect-paths' ? 'paths' : 'brackets'))
const drawn = computed(() => ctx.margin.value === 'end')
const records: ConnectionRec[] = CONNECTIONS[ctx.articleId] ?? []
const body = () => document.querySelector<HTMLElement>('.tn-body')

// ── The list (entry point) ─────────────────────────────────────────────────
const threads = shallowRef<{ target: string; text: string; count: number }[]>([])
onMounted(() => setTimeout(() => (threads.value = body() ? repeatedTargets(body()!, 2).slice(0, 8) : []), 120))
const topics = records.filter((r): r is TopicRec => r.kind === 'topic')
const relations = records.filter((r): r is RelationRec => r.kind === 'relation')
const togethers = records.filter((r): r is TogetherRec => r.kind === 'together')

const key = computed<string | null>({
  get: () => {
    const v = route.query.connection
    return (Array.isArray(v) ? v[0] : v) ?? null
  },
  set: (k) => {
    const q = { ...route.query }
    if (k) q.connection = k
    else delete q.connection
    void router.replace({ query: q, hash: route.hash })
  },
})
const pick = (k: string) => (key.value = key.value === k ? null : k)

// ── Resolve the selection to passages (fresh from the DOM) ────────────────
interface End {
  id: string
  passage: Passage
  label: string
  /** For a thread, the link itself (its ticks sit on its own line). */
  el?: HTMLElement
  role?: 'from' | 'to' | 'support' | 'member' | 'mention' | 'together'
}
interface Resolved {
  kind: 'thread' | 'topic' | 'relation' | 'together'
  title: string
  ends: End[]
  missing: string[]
  rel?: RelationRec
  support?: { passage: Passage; span: string }
  names?: string[]
}
const version = ref(0)
const resolved = computed<Resolved | null>(() => {
  void version.value
  const k = key.value
  const b = body()
  if (!k || !b) return null
  const [kind, id] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)]
  const missing: string[] = []
  const find = (s: string) => {
    const p = locate(b, s)
    if (!p) missing.push(s)
    return p
  }
  if (kind === 'thread') {
    const ms = mentionsOf(b, id)
    return {
      kind: 'thread',
      title: ms[0]?.link.textContent ?? id.replace(/_/g, ' '),
      ends: ms.map((m, i) => ({ id: `m${i}`, passage: m, label: m.sectionTitle, el: m.link, role: 'mention' as const })),
      missing,
    }
  }
  const rec = records.find((r) => r.id === id && r.kind === kind)
  if (!rec) return null
  if (rec.kind === 'topic') {
    return {
      kind: 'topic',
      title: rec.label,
      ends: rec.members.flatMap((m, i) => {
        const p = find(m.snippet)
        return p ? [{ id: `t${i}`, passage: p, label: ROLE_LABEL[m.role], role: 'member' as const }] : []
      }),
      missing,
    }
  }
  if (rec.kind === 'relation') {
    const from = find(rec.from.snippet)
    const to = find(rec.to.snippet)
    const sup = find(rec.support.snippet)
    const ends: End[] = []
    if (from) ends.push({ id: 'from', passage: from, label: rec.from.label, role: 'from' })
    if (to) ends.push({ id: 'to', passage: to, label: rec.to.label, role: 'to' })
    if (sup && !ends.some((e) => e.passage.block === sup.block && e.passage.text === sup.text))
      ends.push({ id: 'support', passage: sup, label: msg.statesIt, role: 'support' })
    return { kind: 'relation', title: rec.words, ends, missing, rel: rec, support: sup ? { passage: sup, span: rec.support.span } : undefined }
  }
  const p = find(rec.snippet)
  return {
    kind: 'together',
    title: rec.names.join(', '),
    ends: p ? [{ id: 'c', passage: p, label: msg.kindTogether, role: 'together' }] : [],
    missing,
    names: rec.names,
  }
})

// ── Highlights in the text (background or underline only; link colours untouched) ──
const NAMES = ['tn-thread', 'tn-topic', 'tn-rel-end', 'tn-rel-words', 'tn-together']
const supported = typeof CSS !== 'undefined' && 'highlights' in CSS
function paint(r: Resolved | null) {
  if (!supported) return
  const reg = (CSS as unknown as { highlights: Map<string, unknown> }).highlights
  const H = (window as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight
  NAMES.forEach((n) => reg.delete(n))
  if (!r) return
  const set = (name: string, ranges: (Range | null)[]) => {
    const ok = ranges.filter(Boolean) as Range[]
    if (ok.length) reg.set(name, new H(...ok))
  }
  if (r.kind === 'thread')
    set('tn-thread', r.ends.map((e) => {
      const x = document.createRange()
      x.selectNodeContents(e.el!)
      return x
    }))
  if (r.kind === 'topic') set('tn-topic', r.ends.map((e) => e.passage.range()))
  if (r.kind === 'relation') {
    set('tn-rel-end', r.ends.filter((e) => e.role !== 'support').map((e) => e.passage.range()))
    if (r.support) set('tn-rel-words', [spanIn(r.support.passage, r.support.span)])
  }
  if (r.kind === 'together') set('tn-together', (r.names ?? []).map((n) => (r.ends[0] ? spanIn(r.ends[0].passage, n) : null)))
}
watch(resolved, (r) => nextTick(() => {
  paint(r)
  layout()
}))
onBeforeUnmount(() => paint(null))

// ── Geometry for the margin drawing ───────────────────────────────────────
interface Geo { id: string; top: number; bottom: number; y: number; label: string; role?: End['role'] }
const geo = shallowRef<{ ends: Geo[]; textRight: number; x0: number; width: number; height: number } | null>(null)
function layout() {
  const r = resolved.value
  const page = document.querySelector<HTMLElement>('.tn-page')
  const margin = document.getElementById('tn-margin-end')
  const b = body()
  if (!r || !drawn.value || !page || !margin || !b) {
    geo.value = null
    return
  }
  const pr = page.getBoundingClientRect()
  const text = b.getBoundingClientRect()
  const ends: Geo[] = r.ends.flatMap((e) => {
    const rect = (e.el ?? e.passage.range())?.getBoundingClientRect()
    if (!rect || !rect.height) return []
    const first = e.el ? rect : (e.passage.range()?.getClientRects()[0] ?? rect)
    return [{ id: e.id, top: rect.top - pr.top, bottom: rect.bottom - pr.top, y: first.top - pr.top + first.height / 2, label: e.label, role: e.role }]
  })
  geo.value = {
    ends: ends.sort((a, c) => a.top - c.top),
    textRight: text.right - pr.left,
    x0: margin.getBoundingClientRect().left - pr.left + 4,
    width: pr.width,
    height: pr.height,
  }
}
let ro: ResizeObserver | null = null
onMounted(() => {
  window.addEventListener('resize', layout)
  const b = body()
  if (b) {
    ro = new ResizeObserver(() => {
      version.value++
    })
    ro.observe(b)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', layout)
  ro?.disconnect()
})

const relGeo = computed(() => {
  const g = geo.value
  const r = resolved.value
  if (!g || r?.kind !== 'relation') return null
  return { from: g.ends.find((e) => e.role === 'from'), to: g.ends.find((e) => e.role === 'to'), sup: g.ends.find((e) => e.role === 'support') }
})
/** A curve from the text's edge out into the margin and back. */
function curve(y1: number, y2: number, xr: number, room: number) {
  const bulge = Math.min(room, 36 + Math.abs(y2 - y1) * 0.12)
  return { d: `M ${xr} ${y1} C ${xr + bulge} ${y1}, ${xr + bulge} ${y2}, ${xr} ${y2}`, apex: xr + bulge * 0.75 }
}

// ── Where each endpoint is, for the destination references ─────────────────
const where = ref<Record<string, 'above' | 'in view' | 'below'>>({})
function track() {
  const r = resolved.value
  if (!r) return
  const { top, bottom } = obstructions()
  const out: Record<string, 'above' | 'in view' | 'below'> = {}
  for (const e of r.ends) {
    const rect = (e.el ?? e.passage.range())?.getBoundingClientRect()
    if (!rect || !rect.height) continue
    out[e.id] = rect.bottom < top ? 'above' : rect.top > window.innerHeight - bottom ? 'below' : 'in view'
  }
  where.value = out
}
let raf = 0
const onScroll = () => {
  if (!raf)
    raf = requestAnimationFrame(() => {
      raf = 0
      track()
    })
}
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
watch(resolved, () => nextTick(track))

function go(e: End) {
  void nav.jumpTo(e.el ?? e.passage.block, e.passage.range, `${e.label}: ${e.passage.text.slice(0, 80)}… In “${e.passage.sectionTitle}”.`)
}
const supportParts = computed(() => {
  const s = resolved.value?.support
  if (!s) return null
  const at = s.passage.text.indexOf(s.span)
  if (at === -1) return { before: s.passage.text, span: '', after: '' }
  return { before: s.passage.text.slice(0, at), span: s.span, after: s.passage.text.slice(at + s.span.length) }
})
const kindTitle = computed(() => {
  const k = resolved.value?.kind
  return k === 'thread' ? msg.kindThread : k === 'topic' ? msg.kindTopic : k === 'relation' ? msg.kindRelation : k === 'together' ? msg.kindTogether : ''
})
const roleLabel = (e: End) =>
  e.role === 'from' ? msg.from : e.role === 'to' ? msg.to : e.role === 'support' ? msg.statesIt : e.label
</script>

<template>
  <!-- Entry point, below the introduction -->
  <Teleport
    v-if="ctx.leadMount.value"
    :to="ctx.leadMount.value"
  >
    <section
      class="vc3"
      aria-labelledby="vc3-title"
    >
      <h2
        id="vc3-title"
        class="vc3__title"
      >
        {{ msg.connectTitle }}
      </h2>
      <p class="vc3__note">
        {{ msg.connectNote }}
      </p>
      <div class="vc3__kinds">
        <div class="vc3__kind">
          <h3 class="vc3__kind-title">
            <span
              class="vc3__glyph vc3__glyph--thread"
              aria-hidden="true"
            />{{ msg.kindThread }}
          </h3>
          <div class="vc3__items">
            <CdxToggleButton
              v-for="t in threads"
              :key="t.target"
              :model-value="key === `thread:${t.target}`"
              size="small"
              @update:model-value="pick(`thread:${t.target}`)"
            >
              {{ t.text }} ({{ t.count }})
            </CdxToggleButton>
          </div>
        </div>
        <div
          v-if="topics.length"
          class="vc3__kind"
        >
          <h3 class="vc3__kind-title">
            <span
              class="vc3__glyph vc3__glyph--topic"
              aria-hidden="true"
            />{{ msg.kindTopic }}
          </h3>
          <div class="vc3__items">
            <CdxToggleButton
              v-for="t in topics"
              :key="t.id"
              :model-value="key === `topic:${t.id}`"
              size="small"
              @update:model-value="pick(`topic:${t.id}`)"
            >
              {{ t.label }}
            </CdxToggleButton>
          </div>
        </div>
        <div
          v-if="relations.length"
          class="vc3__kind"
        >
          <h3 class="vc3__kind-title">
            <span
              class="vc3__glyph vc3__glyph--relation"
              aria-hidden="true"
            />{{ msg.kindRelation }}
          </h3>
          <div class="vc3__items">
            <CdxToggleButton
              v-for="r in relations"
              :key="r.id"
              :model-value="key === `relation:${r.id}`"
              size="small"
              @update:model-value="pick(`relation:${r.id}`)"
            >
              {{ r.from.label }} <span class="vc3__words">{{ r.directed ? '→' : '—' }} {{ r.words.length > 34 ? r.words.slice(0, 32) + '…' : r.words }} {{ r.directed ? '→' : '—' }}</span> {{ r.to.label }}
            </CdxToggleButton>
          </div>
        </div>
        <div
          v-if="togethers.length"
          class="vc3__kind"
        >
          <h3 class="vc3__kind-title">
            <span
              class="vc3__glyph vc3__glyph--together"
              aria-hidden="true"
            />{{ msg.kindTogether }}
          </h3>
          <div class="vc3__items">
            <CdxToggleButton
              v-for="t in togethers"
              :key="t.id"
              :model-value="key === `together:${t.id}`"
              size="small"
              @update:model-value="pick(`together:${t.id}`)"
            >
              {{ t.names.join(' · ') }}
            </CdxToggleButton>
          </div>
        </div>
        <p
          v-if="!records.length"
          class="vc3__note"
        >
          {{ msg.noCuratedConnections }}
        </p>
      </div>
    </section>
  </Teleport>

  <!-- Margin drawing (wide screens only) -->
  <Teleport
    v-if="drawn && geo && resolved"
    to=".tn-page"
    defer
  >
    <div
      class="vc3-layer"
      aria-hidden="true"
    >
      <svg
        class="vc3-svg"
        :width="geo.width"
        :height="geo.height"
      >
        <defs>
          <marker
            id="vc3-arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 0 L 8 4 L 0 8 z"
              class="vc3-arrowhead"
            />
          </marker>
        </defs>

        <!-- Brackets -->
        <template v-if="mode === 'brackets'">
          <template v-if="resolved.kind === 'thread'">
            <line
              :x1="geo.x0 + 10"
              :x2="geo.x0 + 10"
              :y1="geo.ends[0]?.y"
              :y2="geo.ends[geo.ends.length - 1]?.y"
              class="vc3-spine"
            />
            <line
              v-for="e in geo.ends"
              :key="e.id"
              :x1="geo.x0"
              :x2="geo.x0 + 10"
              :y1="e.y"
              :y2="e.y"
              class="vc3-tick"
            />
          </template>
          <template v-else>
            <path
              v-for="e in geo.ends"
              :key="e.id"
              :d="`M ${geo.x0} ${e.top} h 6 V ${e.bottom} h -6`"
              class="vc3-bracket"
              :class="{ 'vc3-bracket--support': e.role === 'support', 'vc3-bracket--together': resolved.kind === 'together' }"
            />
            <line
              v-if="resolved.kind === 'topic' && geo.ends.length > 1"
              :x1="geo.x0 + 6"
              :x2="geo.x0 + 6"
              :y1="(geo.ends[0].top + geo.ends[0].bottom) / 2"
              :y2="(geo.ends[geo.ends.length - 1].top + geo.ends[geo.ends.length - 1].bottom) / 2"
              class="vc3-spine vc3-spine--topic"
            />
            <template v-if="resolved.kind === 'relation' && relGeo?.from && relGeo?.to">
              <path
                :d="`M ${geo.x0 + 6} ${(relGeo.from.top + relGeo.from.bottom) / 2} H ${geo.x0 + 18} V ${(relGeo.to.top + relGeo.to.bottom) / 2} H ${geo.x0 + 8}`"
                class="vc3-link"
                :marker-end="resolved.rel?.directed ? 'url(#vc3-arrow)' : undefined"
              />
              <line
                v-if="relGeo.sup"
                :x1="geo.x0 + 6"
                :x2="geo.x0 + 18"
                :y1="(relGeo.sup.top + relGeo.sup.bottom) / 2"
                :y2="(relGeo.sup.top + relGeo.sup.bottom) / 2"
                class="vc3-evidence"
              />
            </template>
          </template>
        </template>

        <!-- Curved paths -->
        <template v-else>
          <template v-if="resolved.kind === 'thread'">
            <path
              v-for="(e, i) in geo.ends.slice(1)"
              :key="e.id"
              :d="curve(geo.ends[i].y, e.y, geo.textRight + 4, geo.width - geo.textRight - 30).d"
              class="vc3-curve vc3-curve--thread"
            />
          </template>
          <template v-else-if="resolved.kind === 'topic'">
            <path
              v-for="e in geo.ends"
              :key="e.id"
              :d="`M ${geo.textRight + 4} ${e.y} C ${geo.x0 + 40} ${e.y}, ${geo.x0 + 40} ${geo.ends[0].y - 24}, ${geo.x0 + 120} ${geo.ends[0].y - 24}`"
              class="vc3-curve vc3-curve--topic"
            />
          </template>
          <template v-else-if="resolved.kind === 'relation' && relGeo?.from && relGeo?.to">
            <path
              :d="curve(relGeo.from.y, relGeo.to.y, geo.textRight + 4, geo.width - geo.textRight - 40).d"
              class="vc3-curve vc3-curve--relation"
              :marker-end="resolved.rel?.directed ? 'url(#vc3-arrow)' : undefined"
            />
            <path
              v-if="relGeo.sup"
              :d="`M ${geo.textRight + 4} ${relGeo.sup.y} h 18`"
              class="vc3-evidence"
            />
          </template>
          <circle
            v-for="e in geo.ends"
            v-show="resolved.kind !== 'together'"
            :key="'c' + e.id"
            :cx="geo.textRight + 4"
            :cy="e.y"
            r="3"
            class="vc3-dot"
            :class="{ 'vc3-dot--support': e.role === 'support' }"
          />
        </template>
      </svg>

      <!-- Labels -->
      <template v-if="mode === 'brackets'">
        <span
          v-for="e in geo.ends"
          :key="'l' + e.id"
          class="vc3-label"
          :class="{ 'vc3-label--support': e.role === 'support' }"
          :style="{ insetInlineStart: `${geo.x0 + (resolved.kind === 'relation' ? 24 : 16)}px`, insetBlockStart: `${(e.top + e.bottom) / 2 - 9}px` }"
        >{{ resolved.kind === 'thread' ? e.label : resolved.kind === 'relation' ? roleLabel(resolved.ends.find((x) => x.id === e.id)!) : e.label }}</span>
        <span
          v-if="resolved.kind === 'relation' && relGeo?.from && relGeo?.to"
          class="vc3-label vc3-label--words"
          :style="{
            insetInlineStart: `${geo.x0 + 24}px`,
            insetBlockStart: `${relGeo.sup ? relGeo.sup.bottom + 2 : ((relGeo.from.top + relGeo.from.bottom) / 2 + (relGeo.to.top + relGeo.to.bottom) / 2) / 2 - 9}px`,
          }"
        >“{{ resolved.rel?.words }}”</span>
        <span
          v-if="resolved.kind !== 'relation' && geo.ends[0]"
          class="vc3-label vc3-label--title"
          :style="{ insetInlineStart: `${geo.x0}px`, insetBlockStart: `${geo.ends[0].top - 22}px` }"
        >{{ resolved.title }}</span>
      </template>
      <template v-else>
        <span
          v-if="resolved.kind === 'relation' && relGeo?.from && relGeo?.to"
          class="vc3-label vc3-label--words"
          :style="{ insetInlineStart: `${curve(relGeo.from.y, relGeo.to.y, geo.textRight + 4, geo.width - geo.textRight - 40).apex - 6}px`, insetBlockStart: `${(relGeo.from.y + relGeo.to.y) / 2 - 9}px` }"
        >“{{ resolved.rel?.words }}”</span>
        <span
          v-else-if="resolved.kind === 'topic' && geo.ends[0]"
          class="vc3-label vc3-label--title"
          :style="{ insetInlineStart: `${geo.x0 + 124}px`, insetBlockStart: `${geo.ends[0].y - 33}px` }"
        >{{ resolved.title }}</span>
        <span
          v-else-if="resolved.kind === 'thread' && geo.ends[0]"
          class="vc3-label vc3-label--title"
          :style="{ insetInlineStart: `${geo.x0 + 30}px`, insetBlockStart: `${geo.ends[0].y - 22}px` }"
        >{{ resolved.title }}</span>
        <span
          v-for="e in geo.ends.filter((x) => resolved!.kind === 'topic' || x.role === 'support')"
          :key="'r' + e.id"
          class="vc3-label vc3-label--role"
          :style="{ insetInlineStart: `${geo.textRight + 12}px`, insetBlockStart: `${e.y + 2}px` }"
        >{{ e.label }}</span>
      </template>
    </div>
  </Teleport>

  <!-- The selected connection: evidence and destinations (always; the lines are optional) -->
  <Teleport
    v-if="resolved"
    to="#tn-margin-end"
    defer
    :disabled="!drawn"
  >
    <aside
      class="vc3-card"
      :class="{ 'vc3-card--margin': drawn, 'vc3-card--bar': !drawn }"
      :data-tn-obstruct="drawn ? undefined : 'bottom'"
      :aria-label="kindTitle"
    >
      <div class="vc3-card__head">
        <span
          class="vc3__glyph"
          :class="`vc3__glyph--${resolved.kind}`"
          aria-hidden="true"
        />
        <span class="vc3-card__kind">{{ kindTitle }}</span>
        <CdxButton
          weight="quiet"
          size="small"
          :aria-label="msg.clear"
          @click="key = null"
        >
          <CdxIcon
            :icon="cdxIconClose"
            size="small"
          />
        </CdxButton>
      </div>
      <p class="vc3-card__title">
        <template v-if="resolved.kind === 'relation' && resolved.rel">
          {{ resolved.rel.from.label }} <b>{{ resolved.rel.directed ? '→' : '—' }}</b> {{ resolved.rel.to.label }}
        </template>
        <template v-else>
          {{ resolved.title }}
        </template>
      </p>

      <div
        v-if="resolved.kind === 'relation' && supportParts"
        class="vc3-card__evidence"
      >
        <p class="vc3-card__label">
          {{ msg.evidence }} · {{ resolved.support?.passage.sectionTitle }}
        </p>
        <blockquote class="vc3-card__quote">
          {{ supportParts.before }}<mark>{{ supportParts.span }}</mark>{{ supportParts.after }}
          <a
            v-if="resolved.support?.passage.citation"
            class="vc3-card__cite"
            :href="resolved.support.passage.citation.href"
          >{{ resolved.support.passage.citation.label }}</a>
        </blockquote>
        <p
          v-if="resolved.rel?.note"
          class="vc3-card__note"
        >
          {{ msg.editorNote }}: {{ resolved.rel.note }}
        </p>
      </div>

      <details
        class="vc3-card__list"
        :open="!drawn || resolved.ends.length <= 3"
      >
        <summary>{{ msg.goTo }} ({{ resolved.ends.length }})</summary>
        <ol class="vc3-card__ends">
          <li
            v-for="e in resolved.ends"
            :key="e.id"
          >
            <button
              type="button"
              class="vc3-card__go"
              @click="go(e)"
            >
              <span class="vc3-card__role">{{ roleLabel(e) }}</span>
              <span class="vc3-card__where">
                <CdxIcon
                  :icon="where[e.id] === 'above' ? cdxIconArrowUp : where[e.id] === 'below' ? cdxIconArrowDown : cdxIconEye"
                  size="x-small"
                />
                {{ e.passage.sectionTitle }} · {{ where[e.id] === 'above' ? msg.above : where[e.id] === 'below' ? msg.below : msg.inViewNow }}
              </span>
              <span class="vc3-card__text">“{{ e.passage.text.slice(0, 110) }}{{ e.passage.text.length > 110 ? '…' : '' }}”</span>
            </button>
          </li>
        </ol>
      </details>
      <p
        v-if="resolved.missing.length"
        class="vc3-card__missing"
      >
        {{ msg.unresolvedShort }}: {{ resolved.missing.join('; ') }}
      </p>
    </aside>
  </Teleport>

  <ReturnBar v-if="drawn || !resolved" />
</template>

<style scoped>
.vc3 {
  padding-block: var(--spacing-75);
  border-block: var(--border-width-base) solid var(--border-color-base);
  font-family: var(--font-family-base);
}
.mw-parser-output .vc3__title,
.vc3__title {
  margin: 0;
  padding: 0;
  border: 0;
  font-family: var(--font-family-base);
  font-size: var(--font-size-medium);
  line-height: var(--line-height-medium);
  font-weight: var(--font-weight-bold);
}
.vc3__note {
  margin: var(--spacing-25) 0 var(--spacing-75);
  color: var(--color-subtle);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
}
.vc3__kinds {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-75);
}
.mw-parser-output .vc3__kind-title,
.vc3__kind-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-50);
  margin: 0 0 var(--spacing-25);
  padding: 0;
  border: 0;
  font-family: var(--font-family-base);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  font-weight: var(--font-weight-bold);
}
.vc3__items {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-25);
}
.vc3__items :deep(.cdx-toggle-button) {
  max-width: 100%;
  white-space: normal;
  text-align: start;
  height: auto;
}
.vc3__words {
  color: var(--color-subtle);
  font-style: italic;
}

/* Legend glyphs: the same marks as the drawing. */
.vc3__glyph {
  display: inline-block;
  flex: none;
  width: 18px;
  height: 14px;
}
.vc3__glyph--thread {
  background:
    linear-gradient(var(--color-base), var(--color-base)) 4px 0 / 1px 100% no-repeat,
    linear-gradient(var(--color-base), var(--color-base)) 0 3px / 5px 1px no-repeat,
    linear-gradient(var(--color-base), var(--color-base)) 0 10px / 5px 1px no-repeat;
}
.vc3__glyph--topic {
  border: 1.5px solid var(--color-base);
  border-inline-start: 0;
  width: 7px;
  margin-inline-end: 11px;
}
.vc3__glyph--relation {
  background:
    linear-gradient(var(--color-progressive), var(--color-progressive)) 0 6px / 14px 2px no-repeat;
  position: relative;
}
.vc3__glyph--relation::after {
  content: '';
  position: absolute;
  inset-inline-end: 0;
  inset-block-start: 3px;
  border: 4px solid transparent;
  border-inline-start: 6px solid var(--color-progressive);
}
.vc3__glyph--together {
  border-block-end: 2px dotted var(--color-subtle);
  height: 10px;
}

/* Margin drawing */
.vc3-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
}
.vc3-svg {
  position: absolute;
  inset: 0;
  overflow: visible;
}
.vc3-bracket {
  fill: none;
  stroke: var(--color-base);
  stroke-width: 1.5;
}
.vc3-bracket--support {
  stroke: var(--color-progressive);
  stroke-width: 2.5;
}
.vc3-bracket--together {
  stroke: var(--color-subtle);
  stroke-dasharray: 2 3;
}
.vc3-spine,
.vc3-tick {
  stroke: var(--color-base);
  stroke-width: 1;
}
.vc3-spine--topic {
  stroke-width: 1.5;
}
.vc3-link {
  fill: none;
  stroke: var(--color-progressive);
  stroke-width: 2;
}
.vc3-evidence {
  fill: none;
  stroke: var(--color-progressive);
  stroke-width: 2;
  stroke-dasharray: 3 2;
}
.vc3-arrowhead {
  fill: var(--color-progressive);
}
.vc3-curve {
  fill: none;
  stroke-width: 1.25;
}
.vc3-curve--thread {
  stroke: var(--color-base);
}
.vc3-curve--topic {
  stroke: var(--color-subtle);
}
.vc3-curve--relation {
  stroke: var(--color-progressive);
  stroke-width: 2;
}
.vc3-dot {
  fill: var(--color-base);
}
.vc3-dot--support {
  fill: var(--color-progressive);
}
.vc3-label {
  position: absolute;
  max-width: 220px;
  padding: 0 3px;
  background: var(--background-color-base);
  color: var(--color-base);
  font-family: var(--font-family-base);
  font-size: var(--font-size-x-small, 12px);
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vc3-label--title {
  font-weight: var(--font-weight-bold);
}
.vc3-label--words {
  color: var(--color-progressive);
  font-style: italic;
  max-width: 230px;
  white-space: normal;
}
.vc3-label--support {
  color: var(--color-progressive);
}
.vc3-label--role {
  color: var(--color-subtle);
  background: transparent;
}

/* Card */
.vc3-card {
  font-family: var(--font-family-base);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  background: var(--background-color-base);
}
.vc3-card--margin {
  position: sticky;
  inset-block-end: var(--spacing-100);
  z-index: 4;
  max-height: 38vh;
  margin-block-start: auto;
  overflow-y: auto;
  padding: var(--spacing-50) var(--spacing-75);
  border: var(--border-width-base) solid var(--border-color-base);
  border-radius: var(--border-radius-base);
  box-shadow: var(--box-shadow-medium);
}
.vc3-card--bar {
  position: fixed;
  inset-inline: 0;
  inset-block-end: 0;
  z-index: 20;
  max-height: 46vh;
  overflow-y: auto;
  padding: var(--spacing-50) var(--spacing-75) calc(var(--spacing-50) + env(safe-area-inset-bottom, 0px));
  border-block-start: var(--border-width-base) solid var(--border-color-base);
  box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.08);
}
.vc3-card p {
  margin: 0 0 var(--spacing-25);
}
.vc3-card__head {
  display: flex;
  align-items: center;
  gap: var(--spacing-50);
}
.vc3-card__kind {
  flex: 1;
  color: var(--color-subtle);
}
.vc3-card__title {
  font-size: var(--font-size-medium);
  line-height: var(--line-height-medium);
  font-weight: var(--font-weight-bold);
}
.vc3-card__label {
  color: var(--color-subtle);
}
.vc3-card__quote {
  margin: 0 0 var(--spacing-50);
  font-family: var(--font-family-base);
  font-size: var(--font-size-small);
  line-height: var(--line-height-small);
  padding-inline-start: var(--spacing-50);
  border-inline-start: 3px solid var(--color-progressive);
  font-style: normal;
}
.vc3-card__quote mark {
  background: var(--background-color-progressive-subtle--active);
  color: inherit;
  text-decoration: underline 2px var(--color-base);
}
.vc3-card__cite {
  font-size: 0.8em;
  vertical-align: super;
}
.vc3-card__note {
  color: var(--color-subtle);
  font-style: italic;
}
.vc3-card__list summary {
  cursor: pointer;
  color: var(--color-progressive);
  padding-block: var(--spacing-25);
}
.vc3-card__ends {
  margin: 0;
  padding: 0;
  list-style: none;
}
.vc3-card__go {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: var(--spacing-25) 0;
  border: 0;
  border-block-start: var(--border-width-base) solid var(--border-color-subtle);
  background: none;
  color: var(--color-base);
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.vc3-card__go:hover .vc3-card__text {
  color: var(--color-progressive);
  text-decoration: underline;
}
.vc3-card__go:focus-visible {
  outline: var(--border-width-thick) solid var(--outline-color-progressive--focus);
  outline-offset: 1px;
}
.vc3-card__role {
  font-weight: var(--font-weight-bold);
}
.vc3-card__where {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-subtle);
}
.vc3-card__missing {
  color: var(--color-warning);
}
</style>
