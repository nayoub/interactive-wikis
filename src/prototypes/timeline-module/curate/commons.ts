/**
 * Wikimedia Commons image search (live Action API call; fine for a prototype).
 * Returns thumbnails with the attribution and licence that must travel with them.
 */
import { wikimediaApiFetchHeaders } from '@/config'

import type { EventImage } from '../model/types'

const API = 'https://commons.wikimedia.org/w/api.php'

/** Commons metadata values are HTML; keep the text. */
function text(html: string | undefined): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

interface ImageInfo {
  thumburl?: string
  url: string
  descriptionurl: string
  mime: string
  extmetadata?: Record<string, { value: string }>
}

export async function searchCommons(query: string, signal?: AbortSignal): Promise<EventImage[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '24',
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '320',
    iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|ImageDescription|ObjectName',
  })
  const res = await fetch(`${API}?${params}`, {
    signal,
    headers: wikimediaApiFetchHeaders('timeline-module commons-search'),
  })
  if (!res.ok) throw new Error(`Commons search failed (${res.status})`)
  const data = await res.json()
  const pages: { pageid: number; title: string; index?: number; imageinfo?: ImageInfo[] }[] =
    data?.query?.pages ?? []
  return pages
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .flatMap((p) => {
      const info = p.imageinfo?.[0]
      if (!info || !/^image\/(jpeg|png|webp|gif)/.test(info.mime)) return []
      const meta = info.extmetadata ?? {}
      const name = p.title
        .replace(/^File:/, '')
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/_/g, ' ')
      return [
        {
          id: `commons:${p.pageid}`,
          src: info.thumburl ?? info.url,
          caption:
            text(meta.ObjectName?.value) ||
            text(meta.ImageDescription?.value).slice(0, 140) ||
            name,
          source: 'commons' as const,
          fileTitle: p.title,
          artist: text(meta.Artist?.value) || 'Unknown author',
          license: text(meta.LicenseShortName?.value) || 'See file page',
          licenseUrl: meta.LicenseUrl?.value,
          pageUrl: info.descriptionurl,
        },
      ]
    })
}

/** The best search to start from: an entity the sentence links to, else the label. */
export function suggestQuery(links: string[] | undefined, label: string, subject: string): string {
  const skip = new Set([subject.toLowerCase(), subject.split(' ').pop()!.toLowerCase()])
  const entity = (links ?? []).find((l) => l.length > 3 && !skip.has(l.toLowerCase()))
  return entity ?? label
}
