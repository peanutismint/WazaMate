#!/usr/bin/env python3
"""Regenerate src/schema.json from a copy of Roland's own editor app.

WazaMate does not guess addresses. Every parameter, range and display label it
knows comes from the data files inside "BTS for WAZA-AIR", Roland's official
editor. This script is how that data got into src/schema.json, and it is kept
here so the result can be checked or rebuilt from a newer version of the app.

You need the app's assets/html folder, which you get by unpacking an APK or XAPK
of BTS for WAZA-AIR that you have obtained yourself:

    unzip BTSforWAZA-AIR.xapk -d xapk
    unzip xapk/jp.co.roland.boss_waza_air_editor.apk -d app
    python3 tools/extract_schema.py app/assets/html

Two files inside it matter:

  js/config/address_map.js  the parameters, their addresses, ranges and defaults
  export/layout.div         the text Roland shows for each value, for example
                            "5:1" for a limiter ratio or "630 Hz" for a filter

The parameter table in src/schema.json was generated from address_map.js when
this project started. This script currently rebuilds the label half, which is
the part that is awkward to transcribe by hand, and verifies it against the
parameter table that is already committed.
"""

import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "src" / "schema.json"

# A parameter address is four 7-bit bytes. Roland's data stores the lower two as
# one number, so 0x0562 means bytes 05 62, which is byte 5 * 128 + 0x62.
def linear(addr: int) -> int:
    return ((addr >> 8) & 0x7F) * 128 + (addr & 0x7F)


def main(assets: Path) -> int:
    layout = (assets / "export" / "layout.div").read_text(encoding="utf-8", errors="replace")
    items = json.loads((assets / "export" / "item.json").read_text(encoding="utf-8"))
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    params = schema["params"]

    def value_labels(stringer_id: str):
        """The list of display strings Roland shows for one parameter."""
        at = layout.find(f'id="{stringer_id}"')
        if at < 0:
            return None
        start = layout.find('<div style="display:none;">', at)
        if start < 0 or start - at > 600:
            return None
        end = layout.find("</div>", start)
        return [
            html.unescape(re.sub(r"<br\s*/?>", " ", m)).strip()
            for m in re.findall(r"<p [^>]*>(.*?)</p>", layout[start:end])
        ]

    # Roland's UI items name a parameter by scope and byte offset, which is how
    # we match a label list to a parameter in our own table.
    by_key = {}
    for p in params:
        scope = {"patch": "Temporary%Patch", "system": "System%System"}.get(p["scope"])
        if scope:
            by_key[f'{scope}%{linear(p["addr"])}'] = p

    labels, skipped = {}, 0
    for item in items.values():
        pid, stringer = item.get("pid"), item.get("stringer")
        if not pid or not stringer or pid not in by_key:
            continue
        found = value_labels(stringer)
        if not found:
            continue
        p = by_key[pid]
        top = p["max"] + p["ofs"]
        if len(found) <= top:
            skipped += 1
            continue
        found = found[: top + 1]
        # Skip lists that are just the numbers the value already shows.
        low = p["min"] + p["ofs"]
        if all(found[r] in (str(r - p["ofs"]), f'+{r - p["ofs"]}') for r in range(low, top + 1)):
            continue
        labels[p["id"]] = found

    schema["labels"] = labels
    SCHEMA.write_text(json.dumps(schema, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(labels)} label lists for {len(params)} parameters into {SCHEMA.relative_to(ROOT)}")
    if skipped:
        print(f"{skipped} label list(s) were shorter than the parameter range and were left out")
    print("Now run: python3 build.py")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: python3 tools/extract_schema.py <path to the app's assets/html folder>")
    folder = Path(sys.argv[1])
    if not (folder / "export" / "layout.div").exists():
        raise SystemExit(f"{folder} does not look like the app's assets/html folder (no export/layout.div)")
    raise SystemExit(main(folder))
