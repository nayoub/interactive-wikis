/**
 * Street-level base for the map: OpenStreetMap data as vector tiles from
 * OpenFreeMap (free, no key), drawn by MapLibre GL behind the renderer's own
 * marks. MapLibre is display only: the renderer keeps its own view (pan, zoom,
 * clusters, labels) and mirrors it here.
 *
 * The style is OpenFreeMap's Positron, recoloured from the visualization tokens
 * (`--viz-map-*` in ../tokens.css): neutrals only, so the base stays weaker than
 * the marks and follows light/dark themes. Shields and airport icons are hidden.
 *
 * MapLibre (~800 KB) is imported only when a map is on the page.
 */
import type { Map as MlMap, StyleSpecification } from 'maplibre-gl'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

let stylePromise: Promise<StyleSpecification> | null = null
const loadStyle = () =>
  (stylePromise ??= fetch(STYLE_URL).then((r) => {
    if (!r.ok) throw new Error(`Map style unavailable (${r.status})`)
    return r.json()
  }))

/** Token values, resolved where the map sits (so themes apply). */
function palette(from: Element) {
  const cs = getComputedStyle(from)
  const t = (name: string) => cs.getPropertyValue(name).trim()
  return {
    land: t('--viz-map-land'),
    water: t('--viz-map-water'),
    green: t('--viz-map-green'),
    building: t('--viz-map-building'),
    road: t('--viz-map-road'),
    major: t('--viz-map-road-major'),
    motorway: t('--viz-map-road-motorway'),
    boundary: t('--viz-map-boundary'),
    label: t('--viz-map-label'),
    labelStrong: t('--viz-map-label-strong'),
  }
}

/** Positron, recoloured: every colour from a token, no hue but the page's neutrals. */
function recolour(style: StyleSpecification, c: ReturnType<typeof palette>): StyleSpecification {
  const s: StyleSpecification = JSON.parse(JSON.stringify(style))
  for (const layer of s.layers) {
    const id = layer.id
    const paint = ((layer as { paint?: Record<string, unknown> }).paint ??= {})
    const layout = ((layer as { layout?: Record<string, unknown> }).layout ??= {})
    if (layer.type === 'background') paint['background-color'] = c.land
    else if (layer.type === 'fill') {
      paint['fill-color'] =
        id === 'water'
          ? c.water
          : id === 'building'
            ? c.building
            : /park|landcover|landuse/.test(id)
              ? c.green
              : c.road
      paint['fill-outline-color'] = paint['fill-color']
    } else if (layer.type === 'line') {
      paint['line-color'] = /waterway/.test(id)
        ? c.water
        : /boundary/.test(id)
          ? c.boundary
          : /motorway/.test(id)
            ? c.motorway
            : /major|railway/.test(id)
              ? c.major
              : c.road
    } else if (layer.type === 'symbol') {
      if (/shield|airport/.test(id)) {
        layout.visibility = 'none'
        continue
      }
      paint['text-color'] = /city|country|state|town/.test(id) ? c.labelStrong : c.label
      paint['text-halo-color'] = c.land
      paint['text-halo-width'] = 1.2
    }
  }
  return s
}

export interface VectorBase {
  /** Mirror the renderer's view: world point (cx, cy) at the centre, k px per world width. */
  setView(cx: number, cy: number, k: number): void
  resize(): void
  destroy(): void
}

const toLngLat = (x: number, y: number): [number, number] => [
  x * 360 - 180,
  (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI,
]

export async function createVectorBase(container: HTMLElement): Promise<VectorBase> {
  const [{ default: maplibregl }, style] = await Promise.all([
    import('maplibre-gl'),
    loadStyle(),
    import('maplibre-gl/dist/maplibre-gl.css'),
  ])
  const map: MlMap = new maplibregl.Map({
    container,
    style: recolour(style, palette(container)),
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    maxZoom: 20,
  })
  return {
    setView(cx, cy, k) {
      // MapLibre's world is 512 px wide at zoom 0.
      map.jumpTo({ center: toLngLat(cx, cy), zoom: Math.max(0, Math.log2(k / 512)) })
    },
    resize() {
      map.resize()
    },
    destroy() {
      map.remove()
    },
  }
}
