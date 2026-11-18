"""Convert the site's own fonts (Doto and JetBrains Mono, SIL Open Font License, already in assets/fonts) from WOFF2
to TTF in ./fonts so Pillow can draw with them. No download: the files come from this repo."""
import os
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.path.join(HERE, "..", "..", "assets", "fonts"))
FONTS = os.path.join(HERE, "fonts")
os.makedirs(FONTS, exist_ok=True)
for src, dst in [("doto-latin-800-normal.woff2", "Doto.ttf"), ("jetbrains-mono-latin-400-normal.woff2", "JetBrainsMono.ttf"),
                 ("jetbrains-mono-latin-700-normal.woff2", "JetBrainsMono-Bold.ttf")]:
    f = TTFont(os.path.join(SRC, src)); f.flavor = None; f.save(os.path.join(FONTS, dst))
print("fonts ready: Doto and JetBrains Mono (SIL Open Font License)")
