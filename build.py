#!/usr/bin/env python3
"""Build index.html from the files in src/.

WazaMate ships as one self-contained HTML file so it can be opened straight from
disk, with no server and no build step for the people using it. This script is
what produces that file.

    python3 build.py           write index.html
    python3 build.py --check   rebuild in memory and fail if index.html is stale

The check mode is what CI runs, so a commit that edits src/ without rebuilding
index.html is caught before it reaches the site.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "index.html"


def build() -> str:
    schema = json.loads((SRC / "schema.json").read_text(encoding="utf-8"))
    # Compact, and with "</" escaped so a stray "</script>" inside the data
    # cannot close the script tag it is embedded in.
    data = json.dumps(schema, separators=(",", ":")).replace("</", "<\\/")

    js = (SRC / "app.js").read_text(encoding="utf-8").replace("/*__DATA__*/null", data)
    css = (SRC / "style.css").read_text(encoding="utf-8")
    page = (SRC / "template.html").read_text(encoding="utf-8")

    for marker, value in (("/*__CSS__*/", css), ("/*__JS__*/", js)):
        if marker not in page:
            raise SystemExit(f"src/template.html is missing the {marker} marker")
        page = page.replace(marker, value)
    return page


def main() -> int:
    page = build()
    if "--check" in sys.argv:
        if not OUT.exists():
            print("index.html is missing. Run: python3 build.py")
            return 1
        if OUT.read_text(encoding="utf-8") != page:
            print("index.html is out of date with src/. Run: python3 build.py")
            return 1
        print(f"index.html is up to date ({len(page):,} bytes)")
        return 0

    OUT.write_text(page, encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)} ({len(page):,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
