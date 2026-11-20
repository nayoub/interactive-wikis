#!/usr/bin/env python3
"""Pre-project Natural Earth land (public domain) into one SVG path, for the map's base.

Input:  ne_50m_land.geojson from https://github.com/nvkelso/natural-earth-vector
Output: public/geo/land-50m.mercator.txt — an SVG path `d` in Web Mercator units:
        x, y in 0…SCALE across the world (y from the top, latitude clamped to ±85°),
        relative commands, near-duplicate points dropped. The renderer draws it once
        and pans/zooms it with a transform, so nothing is projected at runtime.

    python3 src/prototypes/map-module/scripts/land.py path/to/ne_50m_land.geojson
"""
import json
import math
import sys

SCALE = 100_000
OUT = "public/geo/land-50m.mercator.txt"


def project(lon: float, lat: float):
    lat = max(-85.0, min(85.0, lat))
    x = (lon + 180.0) / 360.0
    y = (1.0 - math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) / math.pi) / 2.0
    return round(x * SCALE), round(y * SCALE)


def main(path: str) -> None:
    data = json.load(open(path, encoding="utf-8"))
    parts = []
    points = 0
    for f in data["features"]:
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for poly in polys:
            for ring in poly:
                pts = []
                for lon, lat in ring:
                    p = project(lon, lat)
                    if not pts or abs(p[0] - pts[-1][0]) + abs(p[1] - pts[-1][1]) >= 2:
                        pts.append(p)
                if len(pts) < 3:
                    continue
                points += len(pts)
                x0, y0 = pts[0]
                cmds = [f"M{x0} {y0}l"]
                px, py = x0, y0
                rel = []
                for x, y in pts[1:]:
                    rel.append(f"{x - px} {y - py}")
                    px, py = x, y
                cmds.append(" ".join(rel))
                cmds.append("z")
                parts.append("".join(cmds))
    d = "".join(parts)
    with open(OUT, "w") as out:
        out.write(d)
    print(f"{points} points, {len(d) / 1024:.0f} KB → {OUT}")


if __name__ == "__main__":
    main(sys.argv[1])
