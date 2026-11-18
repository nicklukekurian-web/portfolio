"""README art in the site's own look (css/tokens.css), drawn in code: banner, divider, eight icons, animated star.
Writes ../../assets/banner.png, divider.png, star.gif and icons/*.png.
Banner: near-black ground, CRT scan lines, a voxel mask lit in phosphor cyan, Doto and JetBrains Mono type, X-ray bloom.
Icons and star: pixel art in the same cyan family, enlarged with nearest-neighbour so pixels stay sharp."""
import math
import os
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "assets"))
FONTS = os.path.join(HERE, "fonts")
os.makedirs(os.path.join(OUT, "icons"), exist_ok=True)

# Tokens from css/tokens.css
BG, BG2, GROUND = (5, 5, 5), (13, 15, 18), (11, 22, 26)
ICE, CORE, SOFT, DIM = (143, 227, 255), (244, 248, 251), (212, 225, 233), (154, 154, 154)
GLOW1, GLOW2 = (129, 155, 170), (56, 84, 100)

def font(name, size): return ImageFont.truetype(os.path.join(FONTS, name + ".ttf"), int(size))
def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
def ramp(t):                                                      # teal-black → steel → ice → core
    stops = [(0, GROUND), (0.35, GLOW2), (0.62, GLOW1), (0.82, ICE), (1, CORE)]
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        if t <= t1: return lerp(c0, c1, (t - t0) / (t1 - t0))
    return CORE

def bloom(layer, radii=((2, 0.9), (10, 0.8), (26, 0.7))):
    """Add a soft halo to an RGB layer drawn on black (the site's --xray-bloom)."""
    out = layer.copy()
    for r, k in radii:
        out = ImageChops.add(out, Image.eval(layer.filter(ImageFilter.GaussianBlur(r)), lambda v, k=k: int(v * k)))
    return out

# ---------------------------------------------------------------- banner (drawn at 2x, then reduced)
FACE_COLS, FACE_ROWS = 22, 28

def face_value(x, y):
    """Brightness 0..1 of one voxel of the mask, or None outside the head. A lit ellipsoid with eyes, nose and mouth."""
    cx, cy, rx, ry = 10.5, 12.5, 9.3, 12.2
    nx, ny = (x - cx) / rx, (y - cy) / ry
    r2 = nx * nx + ny * ny
    neck = y >= 22 and abs(x - cx) < 4.2 and y < FACE_ROWS
    if r2 > 1 and not neck: return None
    nz = math.sqrt(max(0.0, 1 - min(r2, 1)))
    v = max(0.0, -0.45 * nx - 0.55 * ny + 0.7 * nz)               # light from the upper left
    v = 0.10 + 0.62 * v ** 1.5 if not neck else 0.12 + 0.16 * max(0, -0.4 * nx + 0.5)
    for ex in (7.5, 13.5):                                        # eye sockets and brow
        if 9 <= y <= 10 and abs(x - ex) <= 1.6: v = 0.04
        if y == 8 and abs(x - ex) <= 2.2: v = min(1, v + 0.18)
    if 11 <= y <= 16 and abs(x - cx) <= 0.6: v = min(1, v + 0.22)  # nose ridge
    if y == 19 and 7.5 <= x <= 13.5: v = 0.05                     # mouth
    return max(0.0, min(1.0, v))

def banner():
    S = 2
    W, H = 1440 * S, 420 * S
    base = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(base)
    # teal-black pool behind the mask, faint grid, like the hero
    pool = Image.new("RGB", (W, H), BG)
    ImageDraw.Draw(pool).ellipse([W * 0.02, -H * 0.2, W * 0.42, H * 1.15], fill=GROUND)
    base = Image.blend(base, pool.filter(ImageFilter.GaussianBlur(120 * S)), 0.9)
    d = ImageDraw.Draw(base)
    for gx in range(0, W, 90 * S): d.line([gx, 0, gx, H], fill=lerp(BG, GLOW2, 0.22), width=S)
    for gy in range(0, H, 90 * S): d.line([0, gy, W, gy], fill=lerp(BG, GLOW2, 0.22), width=S)

    glow = Image.new("RGB", (W, H), (0, 0, 0))                    # everything that blooms goes on this layer
    g = ImageDraw.Draw(glow)
    # voxel mask
    cell, ox, oy = 11 * S, 112 * S, 52 * S
    for yy in range(FACE_ROWS):
        for xx in range(FACE_COLS):
            v = face_value(xx, yy)
            if v is None: continue
            x, y = ox + xx * cell, oy + yy * cell
            g.rectangle([x, y, x + cell - 2 * S, y + cell - 2 * S], fill=ramp(v))
    # type
    tx = 470 * S
    f_tag, f_tag_b = font("JetBrainsMono", 21 * S), font("JetBrainsMono-Bold", 21 * S)
    g.text((tx, 78 * S), "// PORTFOLIO ©2026", fill=DIM, font=f_tag)
    size = 104 * S
    f_name = font("Doto", size)
    while f_name.getlength("NICHOLAS KURIAN") > 900 * S: size -= 2 * S; f_name = font("Doto", size)
    g.text((tx, 108 * S), "NICHOLAS KURIAN", fill=CORE, font=f_name)
    g.text((tx, 236 * S), "ML + AI SECURITY", fill=ICE, font=font("JetBrainsMono-Bold", 30 * S))
    g.text((tx, 282 * S), "Explainable fraud and abuse detection. CS @ UT Dallas.", fill=SOFT, font=font("JetBrainsMono", 24 * S))
    # HUD crosshairs, as on the site
    for cx, cy in [(tx - 30 * S, 64 * S), (1340 * S, 64 * S), (tx - 30 * S, 340 * S), (1340 * S, 340 * S)]:
        g.line([cx - 9 * S, cy, cx + 9 * S, cy], fill=GLOW1, width=S); g.line([cx, cy - 9 * S, cx, cy + 9 * S], fill=GLOW1, width=S)
    img = ImageChops.add(base, bloom(glow))
    # status bar along the bottom
    d = ImageDraw.Draw(img)
    d.line([0, H - 62 * S, W, H - 62 * S], fill=lerp(BG, CORE, 0.14), width=S)
    fx, fl = font("JetBrainsMono", 19 * S), font("JetBrainsMono", 19 * S)
    x = 112 * S
    for label, value in [("CURRENTLY", "CS sophomore @ UT Dallas"), ("BASED IN", "Allen, TX"), ("OPEN TO", "Summer 2027 internships")]:
        d.text((x, H - 40 * S), label, fill=DIM, font=fl); x += int(fl.getlength(label)) + 14 * S
        d.text((x, H - 40 * S), value, fill=SOFT, font=fx); x += int(fx.getlength(value)) + 44 * S
    # CRT scan lines and a vignette
    scan = Image.new("RGB", (W, H), (0, 0, 0)); sd = ImageDraw.Draw(scan)
    for y in range(0, H, 4 * S): sd.rectangle([0, y, W, y + S - 1], fill=(255, 255, 255))
    img = ImageChops.subtract(img, Image.eval(scan, lambda v: int(v * 0.07)))
    vig = Image.new("L", (W, H), 0); ImageDraw.Draw(vig).ellipse([-W * 0.15, -H * 0.5, W * 1.15, H * 1.5], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(160 * S))
    img = Image.composite(img, Image.new("RGB", (W, H), BG), Image.eval(vig, lambda v: 110 + int(v * 145 / 255)))
    img = img.resize((W // S, H // S), Image.LANCZOS)
    img.save(os.path.join(OUT, "banner.png"), optimize=True)
    if os.path.getsize(os.path.join(OUT, "banner.png")) > 300_000:           # keep it under 300 KB
        img.quantize(colors=192, dither=Image.FLOYDSTEINBERG).save(os.path.join(OUT, "banner.png"), optimize=True)

# ---------------------------------------------------------------- divider: a thin steel line with bracket ticks
def divider():
    W, H = 960, 16
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    line = GLOW1 + (150,)
    for x in range(24, W - 24, 8): d.rectangle([x, 7, x + 3, 8], fill=line)
    ice = ICE + (255,)
    d.rectangle([4, 2, 4, 13], fill=ice); d.rectangle([4, 2, 10, 2], fill=ice); d.rectangle([4, 13, 10, 13], fill=ice)            # [
    d.rectangle([W - 5, 2, W - 5, 13], fill=ice); d.rectangle([W - 11, 2, W - 5, 2], fill=ice); d.rectangle([W - 11, 13, W - 5, 13], fill=ice)  # ]
    d.rectangle([W // 2 - 4, 5, W // 2 + 3, 10], fill=ICE + (255,))
    im.save(os.path.join(OUT, "divider.png"), optimize=True)

# ---------------------------------------------------------------- pixel icons, in the site's cyan family
K = {"k": BG, "B": ICE, "w": CORE, "l": SOFT, "d": DIM, "n": GROUND, "G": GLOW1, "y": ICE}
MONITOR = ["kkkkkkkkkkkk", "kllllllllllk", "klnnnnnnnnlk", "klnBBBBBBnlk", "klnBwBBBBnlk", "klnBBBBBBnlk",
           "klnnnnnnnnlk", "kllllllllllk", "kkkkllllkkkk", "...kllllk...", ".kkkkkkkkkk."]
CUBE = ["...kkkkkk...", "..kwwwwwwk..", ".kwwwwwwwwk.", "kkkkkkkkkkkk", "kBBBBBkGGGGk", "kBBBBBkGGGGk",
        "kBBBBBkGGGGk", "kBBBBBkGGGGk", "kBBBBBkGGGGk", "kkkkkkkkkkkk"]
SHIELD = ["kkkkkkkkkk", "kBBBBBBBBk", "kBBBBwBBBk", "kBBBwwwBBk", "kBBBBwBBBk", "kBBBBBBBBk", ".kBBBBBBk.",
          ".kBBBBBBk.", "..kBBBBk..", "...kBBk...", "....kk...."]
LOCK = ["..kkkkkk..", ".klkkkklk.", ".klk..klk.", ".klk..klk.", "kkkkkkkkkk", "kBBBBBBBBk", "kBBBkkBBBk",
        "kBBBkkBBBk", "kBBBBBBBBk", "kkkkkkkkkk"]
CHECK = ["kkkkkkkkkk", "kBBBBBBBBk", "kBBBBBBwBk", "kBwBBBwwBk", "kBwwBwwBBk", "kBBwwwBBBk", "kBBBwBBBBk",
         "kBBBBBBBBk", "kkkkkkkkkk"]
BOLT = ["...kkkk.", "..kBBBk.", ".kBBBk..", "kBBBBBkk", "kkkBBBBk", "..kBBBk.", ".kBBk...", ".kBk....", ".kk....."]
DOC = ["kkkkkkkk.", "kwwwwwwkk", "kwBBBBwwk", "kwwwwwwwk", "kwBBBBBwk", "kwwwwwwwk", "kwBBBwwwk", "kwwwwwwwk",
       "kkkkkkkkk"]
TERMINAL = ["kkkkkkkkkkkk", "knnnnnnnnnnk", "knBnnnnnnnnk", "knnBnnnnnnnk", "knBnnBBBnnnk", "knnnnnnnnnnk",
            "kkkkkkkkkkkk"]
ICONS = {"monitor": MONITOR, "cube": CUBE, "shield": SHIELD, "lock": LOCK, "check": CHECK, "bolt": BOLT,
         "doc": DOC, "terminal": TERMINAL}

def icons():
    for name, art in ICONS.items():
        w, h = len(art[0]), len(art)
        im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        for j, row in enumerate(art):
            for i, ch in enumerate(row):
                if ch != ".": im.putpixel((i, j), K[ch] + (255,))
        im.resize((w * 4, h * 4), Image.NEAREST).save(os.path.join(OUT, "icons", name + ".png"), optimize=True)

def star_gif():
    """A 13x13 cyan crosshair star that pulses for 3 s (12 frames x 250 ms). Index 0 is transparent."""
    cols = [ICE, CORE, GLOW1]
    pal = [0, 0, 0] + [v for c in cols for v in c]
    def frame(r, hot):
        im = Image.new("P", (13, 13), 0); im.putpalette(pal + [0] * (768 - len(pal)))
        d = ImageDraw.Draw(im); c = 6
        d.rectangle([c, c - r, c, c + r], fill=1); d.rectangle([c - r, c, c + r, c], fill=1)
        if r >= 4:
            for p in [(c - 2, c - 2), (c + 2, c - 2), (c - 2, c + 2), (c + 2, c + 2)]: d.point(p, fill=3)
        d.rectangle([c - 1, c - 1, c + 1, c + 1], fill=2 if hot else 1)
        return im.resize((52, 52), Image.NEAREST)
    radii = [3, 4, 5, 6, 6, 5, 4, 3, 3, 4, 5, 3]
    frames = [frame(r, i % 3 == 0) for i, r in enumerate(radii)]
    frames[0].save(os.path.join(OUT, "star.gif"), save_all=True, append_images=frames[1:], duration=250, loop=0,
                   transparency=0, disposal=2, optimize=False)

if __name__ == "__main__":
    if not os.path.exists(os.path.join(FONTS, "Doto.ttf")): raise SystemExit("run `python3 fetch_fonts.py` first")
    banner(); divider(); icons(); star_gif()
    for root, _, fs in os.walk(OUT):
        for f in sorted(fs):
            if f.endswith((".png", ".gif")) and ("icons" in root or f in ("banner.png", "divider.png", "star.gif")):
                p = os.path.join(root, f); print(os.path.relpath(p, OUT), os.path.getsize(p), "bytes", Image.open(p).size)
