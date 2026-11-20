/**
 * The general object every visual is made of: sets of items, each item a few
 * typed components and a pointer to where it came from. The timeline, the
 * map and the election module's models are special cases of it; the adapters
 * at the bottom turn an item list into what their renderers already take.
 *
 * Operators on the object:
 *   - Compare: a visual holds more than one set (`sets[1]` …), items matched
 *     by label. Built (population chart).
 *   - Over time: one set per moment, stepped by a control. Not rebuilt; the
 *     election module's year control is this operator as a special case
 *     (VisualSpec.previous → sets, ElectionView's year → the shown set).
 *   - Link: two visuals on one page share items (same wikidataId or source
 *     sentence). Not rebuilt; ArticleModules' `sameThing` (timeline ↔ map) is
 *     this operator as a special case and would read `Item.source` here.
 */
import type {
  Citation,
  EventImage,
  Party,
  PartialDate,
  Place,
  SourceAnchor,
  TimelineDate,
  TimelineEvent,
} from './types'

export type FormId =
  | 'timeline'
  | 'map'
  | 'linked'
  | 'line'
  | 'columns'
  | 'bars'
  | 'seats'
  | 'smallColumns'
  | 'annotated'

export type ComponentKind = 'time' | 'place' | 'quantity' | 'category' | 'parent' | 'region'

/** A time. Month-of-year values (climate normals) have no year: `start.y` is 0 and `recurring` is set. */
export interface TimeComponent extends TimelineDate {
  recurring?: boolean
}

export interface ItemComponents {
  time?: TimeComponent
  place?: { lat: number; lon: number }
  quantity?: { value: number; unit: string; measure: string }
  category?: string
  parent?: string
  /** A marker on an image, as fractions of its width and height. */
  region?: { imageId: string; x: number; y: number }
}

export interface ItemSource {
  kind: 'sentence' | 'tableRow' | 'infobox' | 'image'
  anchor?: SourceAnchor
  /** The sentence, the row's cells, or the image caption. */
  text: string
}

export interface Item {
  id: string
  /** Short, editor-editable. */
  label: string
  components: ItemComponents
  source: ItemSource
  citation?: Citation
  image?: EventImage
  wikidataId?: string
  /** The thing's name in other languages, from Wikidata at build time ("eu", "fr"). */
  labels?: Record<string, string>
}

export interface VisualSet {
  /** "Bilbao", "2021". */
  label: string
  items: Item[]
}

export interface Visual {
  form: FormId
  title: string
  /** One line on how to read it. */
  caption: string
  sets: VisualSet[]
  /** Form settings (a timeline's ages, a chart's line or columns…), declared by the form. */
  options: Record<string, unknown>
  /** Where the data came from, for the frame's credits ("Results table, “Demographics”"). */
  sourceNote?: string
}

/** Which components the items have (a component counts when most items carry it). */
export function componentsOf(items: Item[]): Set<ComponentKind> {
  const out = new Set<ComponentKind>()
  if (!items.length) return out
  const kinds: ComponentKind[] = ['time', 'place', 'quantity', 'category', 'parent', 'region']
  for (const k of kinds) {
    const n = items.filter((i) => i.components[k] !== undefined).length
    if (n >= items.length / 2) out.add(k)
  }
  return out
}

/** An item's label in a language, else its own. */
export const labelIn = (item: Item, lang?: string) =>
  (lang && lang !== 'en' && item.labels?.[lang]) || item.label

// ── Adapters: the general object as the existing renderers' models ─────────

const anchorOf = (i: Item): SourceAnchor =>
  i.source.anchor ?? {
    sectionId: 'Lead',
    sectionTitle: 'Lead',
    mentionId: i.id,
    sentenceStart: 0,
    sentenceEnd: 0,
  }

export function toTimelineEvents(items: Item[], lang?: string): TimelineEvent[] {
  return items
    .filter((i) => i.components.time && !i.components.time.recurring)
    .map((i) => ({
      id: i.id,
      label: labelIn(i, lang),
      date: i.components.time!,
      sourceText: i.source.text,
      sourceDateText: '',
      sourceAnchor: anchorOf(i),
      citation: i.citation,
      image: i.image,
    }))
}

export function toPlaces(items: Item[], lang?: string): Place[] {
  return items
    .filter((i) => i.components.place)
    .map((i) => ({
      id: i.id,
      label: labelIn(i, lang),
      name: labelIn(i, lang),
      coordinates: { ...i.components.place! },
      date: i.components.time,
      wikidataId: i.wikidataId ?? i.id,
      sourceText: i.source.text,
      sourceDateText: '',
      sourceAnchor: i.source.anchor,
      citation: i.citation,
      image: i.image,
    }))
}

export function toParties(items: Item[], lang?: string): Party[] {
  return items
    .filter((i) => i.components.quantity)
    .map((i) => {
      const q = i.components.quantity!
      const label = labelIn(i, lang)
      return {
        id: i.id,
        key: i.wikidataId ?? i.id,
        name: i.components.category ?? label,
        shortName: label,
        label,
        seats: q.value,
        sourceText: i.source.text,
        sourceDateText: '',
        sourceAnchor: i.source.anchor,
        citation: i.citation,
      }
    })
}

/** Item ← a picked date mention, a place, a table row: see pick/toItems.ts. */
export type { PartialDate }
