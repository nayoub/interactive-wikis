#!/usr/bin/env python3
"""Snapshot an English Wikipedia article (Parsoid HTML) for the module prototypes.

Writes the <body> HTML to public/snapshots/<slug>.html and downloads every
image it references into public/snapshots/<slug>/, rewriting the <img src> to
a relative local path so the prototype works offline.

Run from the repo root:
    python3 src/prototypes/timeline-module/scripts/snapshot.py [--revision N]
    python3 src/prototypes/timeline-module/scripts/snapshot.py --title "2025 German federal election" --slug german-federal-election-2025
"""
import argparse
import hashlib
import html as htmllib
import os
import re
import time
import urllib.parse
import urllib.request

TITLE = "Frank Gehry"
SLUG = "frank-gehry"
UA = open("src/api-user-agent.txt").read().strip()


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--revision", type=int)
    p.add_argument("--title", default=TITLE)
    p.add_argument("--slug", default=SLUG)
    p.add_argument("--no-images", action="store_true", help="keep remote image URLs")
    a = p.parse_args()
    OUT_HTML = f"public/snapshots/{a.slug}.html"
    OUT_DIR = f"public/snapshots/{a.slug}"
    slug = urllib.parse.quote(a.title.replace(" ", "_"), safe="")
    url = f"https://en.wikipedia.org/api/rest_v1/page/html/{slug}"
    if a.revision:
        url += f"/{a.revision}"
    full = get(url).decode("utf-8")
    rev = re.search(r"Special:Redirect/revision/(\d+)", full)
    body = re.search(r"<body[^>]*>(.*)</body>", full, re.S).group(1)

    os.makedirs(OUT_DIR, exist_ok=True)
    cache: dict[str, str] = {}

    def local(src: str) -> str:
        raw = htmllib.unescape(src)
        if raw.startswith("//"):
            raw = "https:" + raw
        clean = raw.split("?")[0]
        if clean in cache:
            return cache[clean]
        name = urllib.parse.unquote(clean.rsplit("/", 1)[-1])
        name = re.sub(r"[^A-Za-z0-9._-]", "_", name)
        if len(name) > 80:
            ext = os.path.splitext(name)[1]
            name = hashlib.sha1(clean.encode()).hexdigest()[:12] + ext
        path = os.path.join(OUT_DIR, name)
        if not os.path.exists(path):
            for attempt in range(3):
                try:
                    data = get(clean)
                    break
                except Exception:
                    time.sleep(1 + attempt)
            else:
                cache[clean] = src
                return src
            open(path, "wb").write(data)
            time.sleep(0.2)
        cache[clean] = f"snapshots/{a.slug}/" + name
        return cache[clean]

    def fix_img(m: re.Match) -> str:
        tag = m.group(0)
        if a.no_images:
            return re.sub(r'\s(srcset)="[^"]*"', "", tag)
        tag = re.sub(r'\s(srcset|data-file-width|data-file-height)="[^"]*"', "", tag)
        return re.sub(r'src="([^"]*)"', lambda s: f'src="{local(s.group(1))}"', tag)

    body = re.sub(r"<img\b[^>]*>", fix_img, body)
    header = f"<!-- {a.title}, enwiki revision {rev.group(1) if rev else '?'}, CC BY-SA 4.0 -->\n"
    open(OUT_HTML, "w", encoding="utf-8").write(header + body)
    print(f"wrote {OUT_HTML} ({len(body)} bytes), {len(cache)} images")


if __name__ == "__main__":
    main()
