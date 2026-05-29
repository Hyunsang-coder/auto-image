#!/usr/bin/env python3
"""Generate diagnostic screenshot fixtures for the "real behavior" test layer.

Each fixture is split left/right with an unambiguous asymmetric design so a
span-group split (and seam alignment) can be verified in pixels, not eyeballed:

  - left half  : solid red,  giant white "L"
  - right half : solid blue, giant white "R"
  - a yellow vertical line at the exact horizontal center  -> the expected seam
  - evenly spaced horizontal gridlines -> check vertical alignment across a split

Dimensions match the Apple export sizes in src/constants/deviceSpecs.ts, so the
aspect auto-detector (detectDeviceFromAspect) frames each one as the right
device on upload. Re-run after changing those specs:

    python3 e2e/fixtures/generate_fixtures.py

Output PNGs are committed; this script is the source of truth for them.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent
RED = (220, 50, 47)
BLUE = (38, 99, 218)
YELLOW = (255, 214, 10)
WHITE = (255, 255, 255)
GRID = (255, 255, 255, 90)

# (filename, width, height) — mirror deviceSpecs.ts export dimensions.
FIXTURES = [
    ("span_iphone.png", 1320, 2868),
    ("span_ipad.png", 2064, 2752),
]


def _font(size):
    for path in (
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def _centered_letter(draw, letter, cx, cy, font):
    box = draw.textbbox((0, 0), letter, font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    draw.text((cx - w / 2 - box[0], cy - h / 2 - box[1]), letter, fill=WHITE, font=font)


def build(name: str, width: int, height: int) -> None:
    img = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(img, "RGBA")
    mid = width // 2

    draw.rectangle([0, 0, mid, height], fill=RED)
    draw.rectangle([mid, 0, width, height], fill=BLUE)

    # Horizontal gridlines every ~1/12 of the height.
    step = height // 12
    for y in range(step, height, step):
        draw.line([(0, y), (width, y)], fill=GRID, width=max(2, height // 1400))

    # Seam: yellow vertical center line.
    draw.line([(mid, 0), (mid, height)], fill=YELLOW, width=max(4, width // 300))

    font = _font(int(width * 0.30))
    _centered_letter(draw, "L", width * 0.25, height * 0.5, font)
    _centered_letter(draw, "R", width * 0.75, height * 0.5, font)

    img.save(OUT / name)
    print(f"wrote {name} ({width}x{height})")


if __name__ == "__main__":
    for name, w, h in FIXTURES:
        build(name, w, h)
