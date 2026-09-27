#!/usr/bin/env python3
"""
Generate the Foldreel app icon (window / tray / installer).

Playful / approachable look: a rounded plum tile holding a folded photo card
(the "fold" - rename/organize into albums) with a coral play-reel badge
tucked into its corner (the "reel" - download/convert media).

    py scripts/make-icon.py
    -> electron/assets/icon.ico  (16..256 multi-res)
    -> electron/assets/icon.png  (512)
    -> electron/assets/icon.svg
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "electron", "assets")
os.makedirs(OUT, exist_ok=True)

PLUM   = (91, 62, 150, 255)    # #5B3E96 tile background
CARD   = (255, 248, 240, 255)  # #FFF8F0 photo card
YELLOW = (255, 201, 60, 255)   # #FFC93C sun/photo dot
CORAL  = (255, 107, 74, 255)   # #FF6B4A dog-ear fold + reel badge

S = 1024                     # master canvas


def rounded(draw, box, r, fill):
    draw.rounded_rectangle(box, radius=r, fill=fill)


def render(size=S):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = size / 1024.0

    # tile
    m = 36 * u
    rounded(d, [m, m, size - m, size - m], 224 * u, PLUM)

    # photo card
    card = [240 * u, 200 * u, 784 * u, 680 * u]
    rounded(d, card, 56 * u, CARD)

    # dog-ear fold at the card's top-right corner
    d.polygon([(700 * u, 200 * u), (784 * u, 200 * u), (784 * u, 284 * u)], fill=CORAL)

    # sun / photo dot inside the card
    cx, cy, r = 360 * u, 340 * u, 54 * u
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=YELLOW)

    # reel/play badge, overlapping the card's bottom-right corner
    bx, by, br = 700 * u, 560 * u, 150 * u
    d.ellipse([bx - br, by - br, bx + br, by + br], fill=CORAL)
    d.polygon([(650 * u, 500 * u), (650 * u, 620 * u), (750 * u, 560 * u)], fill=CARD)

    return img


master = render(S)

# PNG
master.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "icon.png"))

# ICO (multi-resolution)
sizes = [16, 24, 32, 48, 64, 128, 256]
master.save(os.path.join(OUT, "icon.ico"),
            sizes=[(s, s) for s in sizes])

# SVG (hand-written to match)
svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect x="36" y="36" width="952" height="952" rx="224" fill="#5B3E96"/>
  <rect x="240" y="200" width="544" height="480" rx="56" fill="#FFF8F0"/>
  <path d="M700 200 H784 V284 Z" fill="#FF6B4A"/>
  <circle cx="360" cy="340" r="54" fill="#FFC93C"/>
  <circle cx="700" cy="560" r="150" fill="#FF6B4A"/>
  <path d="M650 500 V620 L750 560 Z" fill="#FFF8F0"/>
</svg>
"""
with open(os.path.join(OUT, "icon.svg"), "w", encoding="utf-8") as f:
    f.write(svg)

# copy png into the frontend public dir for the favicon too
pub = os.path.join(ROOT, "frontend", "public")
if os.path.isdir(pub):
    master.resize((256, 256), Image.LANCZOS).save(os.path.join(pub, "icon.png"))
    master.save(os.path.join(pub, "icon.ico"), sizes=[(s, s) for s in [16, 32, 48]])

print("wrote:", ", ".join(sorted(os.listdir(OUT))))
