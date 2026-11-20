/**
 * Seat positions for a hemicycle ("parliament") diagram: concentric rows of
 * equally spaced dots, filled party by party from left to right.
 *
 * Rows: the number of rows k is chosen so the spacing along each arc matches
 * the gap between rows (dots sit on a near-square lattice). Each row gets
 * seats in proportion to its length. Seats are then ordered by angle, so a
 * party's block is a wedge from the inner to the outer row.
 *
 * Coordinates: centre at (0, 0), y up is negative (SVG), outer radius R.
 */
export interface Seat {
  x: number
  y: number
  /** Radians, π at the left end, 0 at the right. */
  angle: number
}

export function hemicycle(n: number, R: number, inner: number): { seats: Seat[]; spacing: number } {
  if (n <= 0) return { seats: [], spacing: 0 }
  const r0 = R * inner
  let rows = 1
  let best = Infinity
  for (let k = 1; k <= 60; k++) {
    const along = (Math.PI * k * (r0 + R)) / 2 / n
    const across = k === 1 ? R - r0 : (R - r0) / (k - 1)
    const misfit = Math.abs(along - across)
    if (misfit < best) {
      best = misfit
      rows = k
    }
  }
  const radii = Array.from({ length: rows }, (_, i) =>
    rows === 1 ? (r0 + R) / 2 : r0 + ((R - r0) * i) / (rows - 1),
  )
  const total = radii.reduce((s, r) => s + r, 0)
  // Seats per row in proportion to its length; largest remainder so they sum to n.
  const exact = radii.map((r) => (n * r) / total)
  const counts = exact.map(Math.floor)
  let left = n - counts.reduce((s, c) => s + c, 0)
  exact
    .map((v, i) => [v - Math.floor(v), i] as const)
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => left-- > 0 && counts[i]++)

  const seats: Seat[] = []
  radii.forEach((r, i) => {
    const c = counts[i]
    for (let j = 0; j < c; j++) {
      const angle = c === 1 ? Math.PI / 2 : Math.PI - (Math.PI * j) / (c - 1)
      seats.push({ x: r * Math.cos(angle), y: -r * Math.sin(angle), angle })
    }
  })
  // Left to right; on the same ray, inner first.
  seats.sort((a, b) => b.angle - a.angle || a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y))
  return { seats, spacing: (Math.PI * total) / n }
}

/**
 * Open a gap of `gap` px between neighbouring blocks (`owner[i]` is the block of
 * seat i, blocks numbered left to right). Each row is squeezed a little and
 * every block after the first is moved right by one gap per block before it,
 * so the gaps line up from the inner row to the outer one.
 */
export function withGaps(seats: Seat[], owner: number[], blocks: number, gap: number): Seat[] {
  if (blocks < 2 || gap <= 0) return seats
  return seats.map((p, i) => {
    const r = Math.hypot(p.x, p.y)
    if (!r) return p
    const g = gap / r
    const squeeze = Math.max(0.5, (Math.PI - (blocks - 1) * g) / Math.PI)
    const angle = Math.PI - ((Math.PI - p.angle) * squeeze + owner[i] * g)
    return { x: r * Math.cos(angle), y: -r * Math.sin(angle), angle }
  })
}

/** The outer radius at which `n` dots sit `spacing` apart. */
export function radiusFor(n: number, spacing: number, inner: number) {
  return spacing / Math.sqrt(((Math.PI / 2) * (1 - inner * inner)) / n)
}

// ── Colour contrast (WCAG relative luminance) ──────────────────────────────

/** "#e3000f", "#fff", "rgb(1, 2, 3)" → [r, g, b] 0–255. */
export function rgbOf(color: string): [number, number, number] | null {
  const c = color.trim()
  const hex = c.match(/^#([0-9a-f]{3,8})$/i)?.[1]
  if (hex) {
    const full = hex.length <= 4 ? [...hex.slice(0, 3)].map((h) => h + h).join('') : hex.slice(0, 6)
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
  }
  const rgb = c.match(/^rgba?\(([^)]+)\)/i)?.[1]
  if (rgb) {
    const parts = rgb
      .split(/[\s,/]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map(Number)
    if (parts.length === 3 && parts.every((v) => !Number.isNaN(v)))
      return parts as [number, number, number]
  }
  return null
}

const lum = ([r, g, b]: [number, number, number]) => {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

export function contrast(a: string, b: string): number {
  const x = rgbOf(a)
  const y = rgbOf(b)
  if (!x || !y) return 21
  const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

/** `t` of the way from colour a to colour b (sRGB). */
export function mix(a: string, b: string, t: number): string {
  const x = rgbOf(a)
  const y = rgbOf(b)
  if (!x || !y) return a
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}
