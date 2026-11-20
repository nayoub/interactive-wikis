/**
 * The one escape hatch for places the article mentions without a link: find a
 * Wikidata item by name and read its coordinate. Live calls (the build-time
 * snapshot only covers linked places).
 */
import { wikimediaApiFetchHeaders } from '@/config'

import type { Place } from '../model/types'

const API = 'https://www.wikidata.org/w/api.php'
const headers = () => wikimediaApiFetchHeaders('timeline-module place-search')

export interface ItemHit {
  id: string
  label: string
  description?: string
}

export async function searchItems(query: string, signal?: AbortSignal): Promise<ItemHit[]> {
  const params = new URLSearchParams({
    action: 'wbsearchentities',
    format: 'json',
    origin: '*',
    language: 'en',
    uselang: 'en',
    type: 'item',
    limit: '8',
    search: query,
  })
  const res = await fetch(`${API}?${params}`, { signal, headers: headers() })
  if (!res.ok) throw new Error(`Wikidata search failed (${res.status})`)
  const data = await res.json()
  return (data.search ?? []).map((s: { id: string; label?: string; description?: string }) => ({
    id: s.id,
    label: s.label ?? s.id,
    description: s.description,
  }))
}

type Claims = Record<string, { mainsnak?: { datavalue?: { value?: any } } }[]>
const first = (claims: Claims, prop: string) => claims[prop]?.[0]?.mainsnak?.datavalue?.value

/** A place from an item, or null when the item has no coordinate. */
export async function placeFromItem(id: string): Promise<Place | null> {
  const params = new URLSearchParams({
    action: 'wbgetentities',
    format: 'json',
    origin: '*',
    ids: id,
    props: 'labels|claims',
    languages: 'en',
  })
  const res = await fetch(`${API}?${params}`, { headers: headers() })
  if (!res.ok) throw new Error(`Wikidata lookup failed (${res.status})`)
  const entity = (await res.json()).entities?.[id]
  const claims: Claims = entity?.claims ?? {}
  const coord = first(claims, 'P625')
  if (!coord || typeof coord.latitude !== 'number') return null

  let country: string | undefined
  const countryId = first(claims, 'P17')?.id
  if (countryId) {
    const c = new URLSearchParams({
      action: 'wbgetentities',
      format: 'json',
      origin: '*',
      ids: countryId,
      props: 'labels',
      languages: 'en',
    })
    const cr = await fetch(`${API}?${c}`, { headers: headers() })
    country = (await cr.json()).entities?.[countryId]?.labels?.en?.value
  }
  const time: string | undefined = first(claims, 'P1619')?.time ?? first(claims, 'P571')?.time
  const year = time ? Number(time.slice(1, 5)) : undefined
  const name: string = entity?.labels?.en?.value ?? id
  return {
    id: `w:${id}`,
    name,
    label: name,
    coordinates: { lat: coord.latitude, lon: coord.longitude },
    country,
    date: year ? { start: { y: year }, precision: 'year' } : undefined,
    dateFrom: year ? 'wikidata' : undefined,
    wikidataId: id,
    sourceText: '',
    sourceDateText: '',
  }
}
