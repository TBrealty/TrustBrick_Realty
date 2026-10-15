"""Checks the stitcher end to end: cuts 30 "phone photos" out of a known 360° image, with slightly
wrong directions (as a phone's sensors give), joins them, and compares the result with the original.

Run inside the container:  python3 selftest.py   (exit code 0 = passed)
"""

import io
import math
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from stitch import stitch_files

random.seed(7)
np.random.seed(7)

SRC_W, SRC_H = 4000, 2000
SHOT_W, SHOT_H = 900, 1200
HFOV = 50.0

# The capture plan the app uses: 12 around at eye level, 8 tilted up, 8 tilted down, up, down.
PLAN = [(y, 0) for y in range(0, 360, 30)] + [(y, 45) for y in range(0, 360, 45)] + [(y, -45) for y in range(0, 360, 45)] + [(0, 90), (0, -90)]


def scene() -> Image.Image:
    """A busy, made-up room: plenty of distinct shapes for matching, like furniture and frames."""
    img = Image.new("RGB", (SRC_W, SRC_H), (205, 196, 180))
    draw = ImageDraw.Draw(img)
    for _ in range(2600):
        x, y = random.randrange(SRC_W), random.randrange(SRC_H)
        w, h = random.randrange(15, 160), random.randrange(15, 160)
        colour = tuple(random.randrange(0, 256) for _ in range(3))
        shape = random.random()
        if shape < 0.4:
            draw.rectangle([x, y, x + w, y + h], fill=colour, outline=(20, 20, 20))
        elif shape < 0.75:
            draw.ellipse([x, y, x + w, y + h], fill=colour)
        else:
            draw.line([x, y, x + w, y + h], fill=colour, width=random.randrange(2, 9))
    return img


def view(src: np.ndarray, yaw: float, pitch: float) -> bytes:
    """What a pinhole camera pointing at (yaw, pitch) sees of the equirectangular image."""
    f = (SHOT_W / 2) / math.tan(math.radians(HFOV) / 2)
    u, v = np.meshgrid(np.arange(SHOT_W) + 0.5, np.arange(SHOT_H) + 0.5)
    x, y, z = (u - SHOT_W / 2) / f, -(v - SHOT_H / 2) / f, np.ones_like(u)
    p, w = math.radians(pitch), math.radians(yaw)
    y1, z1 = y * math.cos(p) + z * math.sin(p), -y * math.sin(p) + z * math.cos(p)
    x2, z2 = x * math.cos(w) + z1 * math.sin(w), -x * math.sin(w) + z1 * math.cos(w)
    lon = np.degrees(np.arctan2(x2, z2))
    lat = np.degrees(np.arctan2(y1, np.hypot(x2, z2)))
    px = ((lon + 180) / 360 * SRC_W).astype(int) % SRC_W
    py = np.clip(((90 - lat) / 180 * SRC_H).astype(int), 0, SRC_H - 1)
    out = io.BytesIO()
    Image.fromarray(src[py, px]).save(out, "JPEG", quality=90)
    return out.getvalue()


def main() -> int:
    original = scene()
    src = np.asarray(original)
    shots = []
    for yaw, pitch in PLAN:
        # The phone's idea of where it pointed: a few degrees off, as real sensors are.
        shots.append((view(src, yaw, pitch), yaw + random.uniform(-4, 4), pitch + random.uniform(-3, 3), random.uniform(-2, 2)))
    data, info = stitch_files(shots, HFOV + 4)
    print("stitch info:", info)

    # Compare blurred (fine detail never survives resampling exactly), allowing a small turn, and
    # against how different an unrelated image is (the same picture turned half way round).
    def prep(img: Image.Image) -> np.ndarray:
        return np.asarray(img.convert("L").resize((720, 360)).filter(ImageFilter.GaussianBlur(3)), dtype=float)[60:300]

    a, b = prep(Image.open(io.BytesIO(data))), prep(original)
    diff, dx, dy = min((np.abs(np.roll(np.roll(a, x, 1), y, 0) - b).mean(), x, y) for x in range(-12, 13) for y in range(-6, 7))
    unrelated = np.abs(a - np.roll(b, 360, 1)).mean()
    print(f"difference {diff:.1f} (an unrelated image: {unrelated:.1f}), off by {dx * 0.5:.1f}° across and {dy * 0.5:.1f}° up")
    # The first photo sets "straight ahead", so the whole room may turn by its sensor error (up to 4° here); it must stay level.
    ok = info["aligned"] and diff < unrelated * 0.4 and abs(dx) <= 10 and abs(dy) <= 4
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
