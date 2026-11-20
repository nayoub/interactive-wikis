/**
 * The same event is often mentioned twice (the lead repeats the birth date that
 * Early life gives in full). A mention counts as already used when an item with
 * the same value exists and either the value is precise enough to identify the
 * event on its own (a full date) or the two sentences largely say the same thing.
 * Two different things in the same year stay separate.
 */
const STOP = new Set(
  'the a an and or of in on at to for by with from as was were is are his her their its he she they that this which who also had has have been into after before than then'.split(
    ' ',
  ),
)

export function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)),
  )
}

/** Overlap coefficient: shared words over the shorter sentence's words. */
export function overlap(a: string, b: string): number {
  const A = words(a)
  const B = words(b)
  if (!A.size || !B.size) return 0
  let shared = 0
  A.forEach((w) => B.has(w) && shared++)
  return shared / Math.min(A.size, B.size)
}

export const LARGELY_MATCHES = 0.5

export interface Comparable {
  id: string
  sentence: string
}

/**
 * The existing item a new mention would duplicate, if any.
 * `sameValue` decides value equality; `identifying` says whether that value alone identifies the event.
 */
export function findDuplicate<T extends Comparable>(
  mention: Comparable,
  items: T[],
  sameValue: (item: T) => boolean,
  identifying: boolean,
): T | null {
  for (const item of items) {
    if (item.id === mention.id || !sameValue(item)) continue
    if (identifying || overlap(item.sentence, mention.sentence) >= LARGELY_MATCHES) return item
  }
  return null
}
