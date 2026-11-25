/**
 * Images from the articles an event's sentence links to ("After Party" → the
 * single's article → its cover). Many of the best fits are not on Commons:
 * album and single covers, posters and logos are non-free files kept on the
 * wiki itself. So this asks the wiki (which also sees Commons), not Commons.
 *
 * Each linked page gives its lead image first (the infobox picture), then the
 * other pictures it uses. Every file keeps its author and licence ("Non-free
 * media" included), so the credit travels with it like a Commons file's.
 */
import { wikimediaApiFetchHeaders } from '@/config'

import type { EventImage } from '../model/types'

export interface LinkedPageImages {
  /** The linked article's title, as the wiki normalises it. */
  title: string
  images: EventImage[]
}

const text = (html: string | undefined) =>
  html ? (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').replace(/\s+/g, ' ').trim() : ''

interface Info {
  thumburl?: string
  url: string
  descriptionurl: string
  mime: string
  width: number
  height: number
  extmetadata?: Record<string, { value: string }>
}

/** Icons, flags, maps and the like: never what a timeline event is a picture of. */
const NOT_A_PICTURE = /\b(logo|icon|flag|symbol|signature|wordmark|commons-logo|wiktionary|question[_ ]book|edit-clear|ambox|padlock|portal|location[_ ]map|blank)\b/i

export async function linkedPageImages(
  titles: string[],
  host: string,
  signal?: AbortSignal,
  perPage = 4,
): Promise<LinkedPageImages[]> {
  if (!titles.length) return []
  const api = `https://${host}/w/api.php`
  const call = async (params: Record<string, string>) => {
    const res = await fetch(`${api}?${new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params })}`, {
      signal,
      headers: wikimediaApiFetchHeaders('timeline-module linked-images'),
    })
    if (!res.ok) throw new Error(`Image lookup failed (${res.status})`)
    return res.json()
  }

  // 1. Each page's lead image and the files it uses.
  const pages = await call({
    action: 'query',
    titles: titles.slice(0, 8).join('|'),
    redirects: '1',
    prop: 'pageimages|images',
    piprop: 'name',
    imlimit: '50',
  })
  const ordered: { title: string; files: string[] }[] = []
  const leads = new Set<string>()
  const byTitle = new Map<string, { title: string; files: string[] }>()
  for (const p of pages?.query?.pages ?? []) {
    if (p.missing) continue
    const lead = p.pageimage ? `File:${p.pageimage.replace(/_/g, ' ')}` : null
    if (lead) leads.add(lead)
    const rest = (p.images ?? []).map((i: { title: string }) => i.title).filter((f: string) => f !== lead && !NOT_A_PICTURE.test(f))
    byTitle.set(p.title, { title: p.title, files: [...(lead ? [lead] : []), ...rest].slice(0, perPage + 4) })
  }
  // Keep the order the sentence names them in (redirects resolved).
  const redirect = new Map<string, string>(
    [...(pages?.query?.normalized ?? []), ...(pages?.query?.redirects ?? [])].map((r: { from: string; to: string }) => [r.from, r.to]),
  )
  for (const t of titles) {
    let k = t
    for (let i = 0; i < 3 && redirect.has(k); i++) k = redirect.get(k)!
    const entry = byTitle.get(k)
    if (entry && !ordered.includes(entry)) ordered.push(entry)
  }
  const files = [...new Set(ordered.flatMap((o) => o.files))]
  if (!files.length) return []

  // 2. Thumbnails and credits for those files (local and Commons alike), 50 per request.
  const info = new Map<string, Info>()
  for (let i = 0; i < files.length; i += 50) {
    const r = await call({
      action: 'query',
      titles: files.slice(i, i + 50).join('|'),
      prop: 'imageinfo',
      iiprop: 'url|mime|size|extmetadata',
      iiurlwidth: '320',
      iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|ImageDescription|ObjectName|NonFree',
    })
    for (const p of r?.query?.pages ?? []) if (p.imageinfo?.[0]) info.set(p.title, p.imageinfo[0])
  }

  /**
   * Within a page: its lead image, then files named after the page ("Don Toliver -
   * After Party (single cover).jpg" on "After Party (song)"), then non-free ones (covers,
   * posters: the lead image of a page about a work, which PageImages never reports),
   * then the rest in the wiki's order.
   */
  const words = (t: string) =>
    t.toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2)
  const rank = (page: string, f: string, i: number) => {
    const name = f.toLowerCase()
    const named = words(page).filter((w) => name.includes(w)).length
    const nonFree = /true/i.test(info.get(f)?.extmetadata?.NonFree?.value ?? '')
    return (i === 0 && leads.has(f) ? 100 : 0) + named * 10 + (nonFree ? 5 : 0) - i / 100
  }
  return ordered
    .map((o) => ({
      title: o.title,
      images: o.files
        .map((f, i) => ({ f, r: rank(o.title, f, i) }))
        .sort((a, b) => b.r - a.r)
        .map((x) => x.f)
        .flatMap((f): EventImage[] => {
          const ii = info.get(f)
          // Photographs and covers only (no SVG diagrams), and not tiny ones.
          if (!ii || !/^image\/(jpeg|png|webp|gif)/.test(ii.mime) || Math.max(ii.width, ii.height) < 120) return []
          const meta = ii.extmetadata ?? {}
          const name = f.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '')
          const nonFree = /true/i.test(meta.NonFree?.value ?? '')
          return [
            {
              id: `wiki:${f}`,
              src: ii.thumburl ?? ii.url,
              caption: text(meta.ObjectName?.value) || text(meta.ImageDescription?.value).slice(0, 140) || name,
              // A file with its own credit (the same handling as a Commons file).
              source: 'commons',
              fileTitle: f,
              artist: text(meta.Artist?.value) || (nonFree ? 'Copyright holder' : 'Unknown author'),
              license: text(meta.LicenseShortName?.value) || (nonFree ? 'Non-free media' : 'See file page'),
              licenseUrl: meta.LicenseUrl?.value,
              pageUrl: ii.descriptionurl,
            },
          ]
        })
        .slice(0, perPage),
    }))
    .filter((o) => o.images.length)
}
