"""Fill {{ncl.*}} tokens in HTML from data/ncl.json, so the NCL rank and total live in one file.
The dev server renders on the fly; scripts/build.sh renders dist/*.html in place. Dev/build only.

    python3 scripts/site_data.py dist/index.html dist/proof.html
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN = re.compile(r"\{\{\s*(ncl\.[a-zA-Z]+)\s*\}\}")


def ordinal(n):
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n:,}{suffix}"


def values():
    with open(os.path.join(ROOT, "data", "ncl.json"), encoding="utf-8") as f:
        d = json.load(f)
    return {
        "ncl.medal": d["medal"],                    # Diamond (NCL's exact word; never a tier number)
        "ncl.rank": ordinal(d["rank"]),             # 420th
        "ncl.total": f"{d['total']:,}",             # 5,962
        "ncl.top": str(round(d["rank"] / d["total"] * 100)),   # 7  (whole percent)
    }


def render(text):
    v = values()

    def sub(m):
        if m.group(1) not in v:
            raise KeyError(f"unknown token {m.group(0)}")
        return v[m.group(1)]

    return TOKEN.sub(sub, text)


if __name__ == "__main__":
    for path in sys.argv[1:]:
        with open(path, encoding="utf-8") as f:
            out = render(f.read())
        with open(path, "w", encoding="utf-8") as f:
            f.write(out)
