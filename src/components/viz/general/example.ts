/**
 * "Load example" for the general tool on Bilbao: the four suggested visuals,
 * made the way an editor would (each from its suggestion, unedited), the
 * population chart compared with San Sebastián, and an annotated image.
 */
import type { LoadedArticle } from '../host/loadArticle'
import type { PlacedModule } from '../host/store'
import type { ModuleKind, Placement } from '../model/types'
import { addMarker, setCompare, type PlacedVisual, type VisualDraft } from './draft'
import { suggestions } from './suggest'

const top = (sectionId: string, sectionTitle: string): Placement => ({
  kind: 'sectionTop',
  sectionId,
  sectionTitle,
})

/** Points an editor placed on an image, labelled with names the caption or article gives. */
export interface Annotation {
  image: string
  points: { x: number; y: number; label: string; sentence?: string }[]
}

export function generalExample(
  article: LoadedArticle,
  where: Record<string, Placement>,
  annotation?: Annotation,
): Partial<Record<ModuleKind, PlacedModule>> & { visuals: PlacedVisual[] } {
  const visuals: PlacedVisual[] = []
  const add = (d: VisualDraft, id: string, placement: Placement) =>
    visuals.push({ id, visual: JSON.parse(JSON.stringify(d.visual)), placement })
  for (const s of suggestions(article)) {
    const placement = where[s.id]
    if (!placement || s.id === 'image') continue
    const d = s.build()
    if (
      d.tableId &&
      article.compare.length &&
      d.visual.sets[0].items[0]?.components.time &&
      !d.visual.sets[0].items[0]?.components.category
    )
      setCompare(d, article, article.compare[0].title)
    add(d, `ex-${s.id}`, placement)
  }
  if (annotation) {
    const img = article.images.find((i) => i.src.includes(annotation.image))
    if (img) {
      const d = suggestions(article)
        .find((s) => s.id === 'image')!
        .build()
      d.imageId = img.id
      d.visual.form = 'annotated'
      d.visual.title = img.caption.split(/[.;]/)[0]
      d.visual.sourceNote = 'Points placed by the editor.'
      for (const p of annotation.points) {
        addMarker(d, article, p.x, p.y)
        const item = d.visual.sets[0].items[d.visual.sets[0].items.length - 1]
        item.label = p.label
        const m = p.sentence
          ? [...article.mentions, ...article.places].find((x) => x.sentence.includes(p.sentence!))
          : null
        if (m) item.source = { kind: 'sentence', anchor: { ...m.anchor }, text: m.sentence }
      }
      add(d, 'ex-image', where.image ?? top('Cityscape', 'Cityscape'))
    }
  }
  return { visuals }
}
