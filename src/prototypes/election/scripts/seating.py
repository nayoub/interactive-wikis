#!/usr/bin/env python3
"""Read an election article's own parliament diagram (run once, commit the output).

The seat order of a hemicycle implies real seating, so the election module
takes its default party order from the diagram the article itself shows,
not from the results table. Parliament diagrams on Commons (made with
parliamentarch / the parliament diagram tool) are SVGs with one <g> per party,
left to right, each holding one <circle> per seat:

    <g style="fill:#be3075" id="0-LINKE"><title>LINKE</title><circle …/>…</g>

Candidates: SVG files shown in the article's Results section or its infobox.
Each is fetched from Commons; the one whose seats come closest to the
infobox's "All N seats" (within 10%) is the diagram. No language model.

Writes public/snapshots/<slug>.seating.json:
    {"file", "total", "parties": [{"label", "color", "seats"}, …]}  (left to right)

Run from the repo root:
    python3 src/prototypes/election/scripts/seating.py --slug german-federal-election-2025
"""
import argparse
import html
import json
import re
import urllib.parse
import urllib.request

UA = open("src/api-user-agent.txt").read().strip()
FILEPATH = "https://commons.wikimedia.org/wiki/Special:FilePath/"


def get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def section(doc: str, heading_id: str) -> str:
    """The HTML from a heading to the next heading of the same level (h2)."""
    i = doc.find(f'id="{heading_id}"')
    if i == -1:
        return ""
    j = doc.find("<h2", i + 1)
    return doc[i : j if j != -1 else len(doc)]


def groups(svg: str):
    out = []
    # Innermost groups only (diagrams may wrap the parties in an outer <g>).
    for m in re.finditer(r"<g\b([^>]*)>((?:(?!<g\b).)*?)</g>", svg, re.S):
        attrs, body = m.group(1), m.group(2)
        color = re.search(r"fill:\s*(#[0-9a-fA-F]{3,8})", attrs)
        n = body.count("<circle")
        if not color or not n:
            continue
        title = re.search(r"<title>([^<]*)</title>", body)
        gid = re.search(r'id="([^"]*)"', attrs)
        label = title.group(1) if title else re.sub(r"^\d+[-_]", "", gid.group(1) if gid else "")
        out.append({"label": html.unescape(label).replace("-", " ").strip(), "color": color.group(1).lower(), "seats": n})
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True)
    slug = ap.parse_args().slug
    doc = open(f"public/snapshots/{slug}.html", encoding="utf-8").read()
    size = re.search(r"All (\d[\d,]*) seats", re.sub(r"<[^>]+>", "", doc))
    want = int(size.group(1).replace(",", "")) if size else None

    infobox = doc[doc.find("infobox") : doc.find("infobox") + 120_000]
    where = section(doc, "Results") + infobox
    files = []
    for f in re.findall(r'resource="\./File:([^"]+?\.svg)"', where, re.I):
        name = urllib.parse.unquote(f)
        if name not in files and not re.search(r"flag|crease|logo|icon|map|by_state|steady", name, re.I):
            files.append(name)

    best = None
    for name in files:
        try:
            svg = get(FILEPATH + urllib.parse.quote(name))
        except Exception as e:  # noqa: BLE001
            print(f"  skip {name}: {e}")
            continue
        gs = groups(svg)
        total = sum(g["seats"] for g in gs)
        if len(gs) < 2 or not total:
            continue
        miss = abs(total - want) / want if want else 0
        print(f"  {name}: {len(gs)} parties, {total} seats")
        if miss <= 0.1 and (best is None or miss < best[0]):
            best = (miss, name, gs, total)

    out = f"public/snapshots/{slug}.seating.json"
    if not best:
        print(f"no parliament diagram found; {out} not written")
        return
    _, name, gs, total = best
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"file": f"File:{name}", "total": total, "parties": gs}, f, ensure_ascii=False, indent=1)
    print(f"{name}: {total} seats → {out}")


if __name__ == "__main__":
    main()
