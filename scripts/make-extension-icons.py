#!/usr/bin/env python3
"""
Generate the browser extension's icon set from the same drawing used for the
app icon (scripts/make-icon.py), so the toolbar icon matches Foldreel exactly.

    py scripts/make-extension-icons.py
    -> extension/icons/icon16.png, icon32.png, icon48.png, icon128.png
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "extension", "icons")
os.makedirs(OUT, exist_ok=True)

PLUM   = (91, 62, 150, 255)    # #5B3E96 tile background
CARD   = (255, 248, 240, 255)  # #FFF8F0 photo card
YELLOW = (255, 201, 60, 255)   # #FFC93C sun/photo dot
CORAL  = (255, 107, 74, 255)   # #FF6B4A dog-ear fold + reel badge

S = 1024


def rounded(draw, box, r, fill):
    draw.rounded_rectangle(box, radius=r, fill=fill)


def render(size=S):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = size / 1024.0

    m = 36 * u
    rounded(d, [m, m, size - m, size - m], 224 * u, PLUM)

    card = [240 * u, 200 * u, 784 * u, 680 * u]
    rounded(d, card, 56 * u, CARD)

    d.polygon([(700 * u, 200 * u), (784 * u, 200 * u), (784 * u, 284 * u)], fill=CORAL)

    cx, cy, r = 360 * u, 340 * u, 54 * u
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=YELLOW)

    bx, by, br = 700 * u, 560 * u, 150 * u
    d.ellipse([bx - br, by - br, bx + br, by + br], fill=CORAL)
    d.polygon([(650 * u, 500 * u), (650 * u, 620 * u), (750 * u, 560 * u)], fill=CARD)

    return img


master = render(S)
for size in (16, 32, 48, 128):
    master.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f"icon{size}.png"))

print("wrote:", ", ".join(sorted(os.listdir(OUT))))
