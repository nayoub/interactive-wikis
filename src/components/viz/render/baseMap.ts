/**
 * The map's base: Natural Earth land and lakes, pre-projected at build time
 * (src/prototypes/map-module/scripts/land.py) at three levels of detail.
 * The renderer asks for what its view needs; files are fetched once and cached.
 *
 *   1:110m  world views                       public/geo/land-110m.json
 *   1:50m   continents                         public/geo/land-50m.json
 *   1:10m   closer in, tiled (16 × 16), only   public/geo/10m/<x>-<y>.json
 *           the tiles on screen are fetched
 */
import { reactive } from 'vue'

export type Level = '110m' | '50m' | '10m'

export interface CoarseLayer {
  scale: number
  land: string
  lakes: string
}
export interface Tile {
  key: string
  x: number
  y: number
  land: string
  lakes: string
  coast: string
  shores: string
}
interface FineIndex {
  scale: number
  grid: number
  tiles: string[]
}

/** Pixels per world width above which a level is too coarse to show. */
const MAX_K: Record<'110m' | '50m', number> = { '110m': 1600, '50m': 12000 }

export function levelFor(k: number): Level {
  if (k <= MAX_K['110m']) return '110m'
  if (k <= MAX_K['50m']) return '50m'
  return '10m'
}

const base = () => `${import.meta.env.BASE_URL}geo/`
const json = <T>(path: string): Promise<T> =>
  fetch(base() + path).then((r) => {
    if (!r.ok) throw new Error(`Base map missing: ${path}`)
    return r.json() as Promise<T>
  })

/** Everything loaded so far (reactive, so renderers update as files arrive). */
export const loaded = reactive<{
  coarse: Partial<Record<'110m' | '50m', CoarseLayer>>
  fine: FineIndex | null
  tiles: Record<string, Tile>
}>({ coarse: {}, fine: null, tiles: {} })

const pending = new Map<string, Promise<unknown>>()
function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!pending.has(key))
    pending.set(
      key,
      load().catch((e) => (pending.delete(key), Promise.reject(e))),
    )
  return pending.get(key) as Promise<T>
}

export function loadCoarse(level: '110m' | '50m') {
  return once(level, async () => {
    loaded.coarse[level] = await json<CoarseLayer>(`land-${level}.json`)
  })
}

/** Fetch the 1:10m tiles covering a view (world coordinates 0…1). */
export async function loadTiles(x0: number, y0: number, x1: number, y1: number) {
  await once('10m-index', async () => {
    loaded.fine = await json<FineIndex>('10m/index.json')
  })
  const index = loaded.fine!
  const have = new Set(index.tiles)
  const g = index.grid
  const clamp = (v: number) => Math.max(0, Math.min(g - 1, v))
  const jobs: Promise<unknown>[] = []
  for (let tx = clamp(Math.floor(x0 * g)); tx <= clamp(Math.floor(x1 * g)); tx++) {
    for (let ty = clamp(Math.floor(y0 * g)); ty <= clamp(Math.floor(y1 * g)); ty++) {
      const key = `${tx}-${ty}`
      if (!have.has(key)) continue
      jobs.push(
        once(`10m/${key}`, async () => {
          const t = await json<Omit<Tile, 'key' | 'x' | 'y'>>(`10m/${key}.json`)
          loaded.tiles[key] = { key, x: tx, y: ty, ...t }
        }),
      )
    }
  }
  await Promise.all(jobs)
}

/** Keys of the 1:10m tiles a view needs (empty ocean tiles are not in the index). */
export function tilesFor(x0: number, y0: number, x1: number, y1: number): string[] {
  const index = loaded.fine
  if (!index) return []
  const have = new Set(index.tiles)
  const g = index.grid
  const clamp = (v: number) => Math.max(0, Math.min(g - 1, v))
  const out: string[] = []
  for (let tx = clamp(Math.floor(x0 * g)); tx <= clamp(Math.floor(x1 * g)); tx++) {
    for (let ty = clamp(Math.floor(y0 * g)); ty <= clamp(Math.floor(y1 * g)); ty++) {
      if (have.has(`${tx}-${ty}`)) out.push(`${tx}-${ty}`)
    }
  }
  return out
}
