#!/usr/bin/env python3
"""Pre-project Natural Earth land and lakes (public domain) for the map's base,
at three levels of detail, so the map is light at world scale and sharp when
zoomed in. Nothing is projected at runtime.

Input folder must hold, from https://github.com/nvkelso/natural-earth-vector (geojson/):
    ne_110m_land, ne_110m_lakes, ne_50m_land, ne_50m_lakes, ne_10m_land, ne_10m_lakes

Output (public/geo/):
    land-110m.json, land-50m.json   {"scale", "land", "lakes"}: SVG path `d` strings
    10m/index.json                   {"scale", "grid", "tiles": ["x-y", …]}
    10m/<x>-<y>.json                 one Mercator tile: {"land", "lakes"} fills, clipped to
                                     the tile, and {"coast", "shores"} open lines, so tile
                                     seams are filled but never stroked.

Coordinates: Web Mercator, the world is SCALE × SCALE (y from the top, latitude
clamped to ±85°), integers, relative path commands, near-duplicates dropped.

    python3 src/prototypes/map-module/scripts/land.py path/to/natural-earth-geojson/
"""
import json
import math
import os
import sys

OUT = "public/geo"
LEVELS = {"110m": (100_000, 6), "50m": (100_000, 2)}  # name → (scale, min step in units)
FINE_SCALE = 1 << 21  # 1:10m: ≈19 m per unit at the equator
FINE_STEP = 4  # drop points closer than this many units (≈75 m)
FINE_TOLERANCE = 12  # Douglas–Peucker tolerance in units (≈230 m at the equator): about one pixel at the closest default zoom
GRID = 16  # 16 × 16 tiles over the world


def project(lon, lat, scale):
    lat = max(-85.0, min(85.0, lat))
    x = (lon + 180.0) / 360.0
    y = (1.0 - math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) / math.pi) / 2.0
    return (round(x * scale), round(y * scale))


def simplify(pts, tol):
    """Douglas–Peucker on a closed ring (iterative)."""
    if tol <= 0 or len(pts) < 8:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        (ax, ay), (bx, by) = pts[i], pts[j]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1.0
        best, idx = 0.0, -1
        for k in range(i + 1, j):
            px, py = pts[k]
            d = abs(dy * (px - ax) - dx * (py - ay)) / norm if (dx or dy) else math.hypot(px - ax, py - ay)
            if d > best:
                best, idx = d, k
        if best > tol and idx > 0:
            keep[idx] = True
            stack.append((i, idx))
            stack.append((idx, j))
    out = [p for p, k in zip(pts, keep) if k]
    return out if len(out) >= 3 else pts


def rings_of(path, scale, step, tol=0):
    data = json.load(open(path, encoding="utf-8"))
    out = []
    for f in data["features"]:
        g = f.get("geometry")
        if not g:
            continue
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for poly in polys:
            for ring in poly:
                pts = []
                for lon, lat in ring:
                    p = project(lon, lat, scale)
                    if not pts or abs(p[0] - pts[-1][0]) + abs(p[1] - pts[-1][1]) >= step:
                        pts.append(p)
                pts = simplify(pts, tol)
                if len(pts) >= 3:
                    out.append(pts)
    return out


def path_closed(rings):
    parts = []
    for pts in rings:
        if len(pts) < 3:
            continue
        x0, y0 = pts[0]
        rel, px, py = [], x0, y0
        for x, y in pts[1:]:
            rel.append(f"{x - px} {y - py}")
            px, py = x, y
        parts.append(f"M{x0} {y0}l{' '.join(rel)}z")
    return "".join(parts)


def path_open(lines):
    parts = []
    for pts in lines:
        if len(pts) < 2:
            continue
        x0, y0 = pts[0]
        rel, px, py = [], x0, y0
        for x, y in pts[1:]:
            rel.append(f"{x - px} {y - py}")
            px, py = x, y
        parts.append(f"M{x0} {y0}l{' '.join(rel)}")
    return "".join(parts)


# ── Clipping to a tile ──────────────────────────────────────────────────────
def clip_polygon(pts, x0, y0, x1, y1):
    """Sutherland–Hodgman against an axis-aligned rectangle (fill only)."""

    def clip(points, inside, cross):
        out = []
        n = len(points)
        for i in range(n):
            cur, prev = points[i], points[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(cross(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cross(prev, cur))
        return out

    def at_x(x):
        return lambda a, b: (x, round(a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])))

    def at_y(y):
        return lambda a, b: (round(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1])), y)

    p = pts
    for inside, cross in (
        (lambda q: q[0] >= x0, at_x(x0)),
        (lambda q: q[0] <= x1, at_x(x1)),
        (lambda q: q[1] >= y0, at_y(y0)),
        (lambda q: q[1] <= y1, at_y(y1)),
    ):
        if not p:
            break
        p = clip(p, inside, cross)
    return p


def clip_lines(pts, x0, y0, x1, y1):
    """The parts of a closed ring's outline inside the rectangle, as open lines (Liang–Barsky)."""
    runs, cur = [], []
    ring = pts + [pts[0]]
    for a, b in zip(ring, ring[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        t0, t1 = 0.0, 1.0
        ok = True
        for p, q in ((-dx, a[0] - x0), (dx, x1 - a[0]), (-dy, a[1] - y0), (dy, y1 - a[1])):
            if p == 0:
                if q < 0:
                    ok = False
                    break
            else:
                t = q / p
                if p < 0:
                    t0 = max(t0, t)
                else:
                    t1 = min(t1, t)
        if not ok or t0 > t1:
            if cur:
                runs.append(cur)
                cur = []
            continue
        s = (round(a[0] + t0 * dx), round(a[1] + t0 * dy))
        e = (round(a[0] + t1 * dx), round(a[1] + t1 * dy))
        if not cur or cur[-1] != s:
            if cur:
                runs.append(cur)
            cur = [s]
        cur.append(e)
        if t1 < 1.0:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return [r for r in runs if len(r) >= 2]


def bbox(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def main(src):
    os.makedirs(os.path.join(OUT, "10m"), exist_ok=True)

    for name, (scale, step) in LEVELS.items():
        land = rings_of(os.path.join(src, f"ne_{name}_land.geojson"), scale, step)
        lakes = rings_of(os.path.join(src, f"ne_{name}_lakes.geojson"), scale, step)
        doc = {"scale": scale, "land": path_closed(land), "lakes": path_closed(lakes)}
        dest = os.path.join(OUT, f"land-{name}.json")
        json.dump(doc, open(dest, "w"), separators=(",", ":"))
        print(f"{name}: {sum(map(len, land)) + sum(map(len, lakes))} points, {os.path.getsize(dest) / 1024:.0f} KB")

    # 1:10m, tiled.
    size = FINE_SCALE // GRID
    tiles = {}

    def add(kind, rings):
        for pts in rings:
            bx0, by0, bx1, by1 = bbox(pts)
            for tx in range(max(0, bx0 // size), min(GRID - 1, bx1 // size) + 1):
                for ty in range(max(0, by0 // size), min(GRID - 1, by1 // size) + 1):
                    x0, y0, x1, y1 = tx * size, ty * size, (tx + 1) * size, (ty + 1) * size
                    t = tiles.setdefault((tx, ty), {"land": [], "lakes": [], "coast": [], "shores": []})
                    if bx0 >= x0 and bx1 <= x1 and by0 >= y0 and by1 <= y1:
                        t[kind].append(pts)
                        t["coast" if kind == "land" else "shores"].append(pts + [pts[0]])
                        continue
                    filled = clip_polygon(pts, x0, y0, x1, y1)
                    if len(filled) >= 3:
                        t[kind].append(filled)
                    t["coast" if kind == "land" else "shores"].extend(clip_lines(pts, x0, y0, x1, y1))

    add("land", rings_of(os.path.join(src, "ne_10m_land.geojson"), FINE_SCALE, FINE_STEP, FINE_TOLERANCE))
    add("lakes", rings_of(os.path.join(src, "ne_10m_lakes.geojson"), FINE_SCALE, FINE_STEP, FINE_TOLERANCE))

    for f in os.listdir(os.path.join(OUT, "10m")):
        os.remove(os.path.join(OUT, "10m", f))
    names, total = [], 0
    for (tx, ty), t in sorted(tiles.items()):
        if not t["land"] and not t["lakes"]:
            continue
        doc = {
            "land": path_closed(t["land"]),
            "lakes": path_closed(t["lakes"]),
            "coast": path_open(t["coast"]),
            "shores": path_open(t["shores"]),
        }
        dest = os.path.join(OUT, "10m", f"{tx}-{ty}.json")
        json.dump(doc, open(dest, "w"), separators=(",", ":"))
        total += os.path.getsize(dest)
        names.append(f"{tx}-{ty}")
    json.dump({"scale": FINE_SCALE, "grid": GRID, "tiles": names}, open(os.path.join(OUT, "10m", "index.json"), "w"))
    print(f"10m: {len(names)} tiles, {total / 1024 / 1024:.1f} MB total")


if __name__ == "__main__":
    main(sys.argv[1])
