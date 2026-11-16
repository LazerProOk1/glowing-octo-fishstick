#!/usr/bin/env python3
"""Build assets/terrain/atlas.png: 4x4 grid of 512x512 grayscale detail tiles.

Usage: python tools/build-terrain-atlas.py <source-dir> [out.png]
<source-dir> holds the ambientCG *_Color.jpg maps (<ID>_1K-JPG_Color.jpg).
Colour comes from the biome palette in the shader; tiles carry only
luminance detail (mean 128, per-slot std, see TARGET_STD).
Tested with Python 3, Pillow 12.1.1, numpy 1.26.4.
Exits non-zero if any tile's wrap-edge seam ratio exceeds MAX_SEAM.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

TILE, GRID = 512, 4
TARGET_MEAN = 128.0
MAX_SEAM = 1.5
# Slot order, row-major; remaining slots are flat 128.
SLOTS = ["Grass005", "Moss002", "Ground054", "Rock051", "Snow010A", "Ground087", "Paper001"]
TARGET_STD = {
    "Grass005": 22.0, "Moss002": 24.0, "Ground054": 16.0, "Rock051": 28.0,
    "Snow010A": 12.0, "Ground087": 18.0, "Paper001": 10.0,
}
# Soft tonal compression scale (in sigmas): smaller squashes outliers harder.
SOFT = {"Snow010A": 0.9}
SOFT_DEFAULT = 2.0
MEDIAN = {"Snow010A": 5}  # median filter size
BLUR = {"Ground087": 1.2}  # gaussian sigma, px
FLATTEN = {"Paper001": 40.0}  # subtract wrap-blurred low frequencies (sigma, px)


def find(src: Path, tex_id: str) -> Path:
    hits = sorted(src.rglob(f"{tex_id}*_Color.jpg"))
    if not hits:
        raise SystemExit(f"missing Color map for {tex_id} in {src}")
    return hits[0]


def seam(a: np.ndarray) -> float:
    """Mean abs jump across the wrap edges relative to inner neighbour jumps."""
    edge = (np.abs(a[:, 0] - a[:, -1]).mean() + np.abs(a[0] - a[-1]).mean()) / 2
    inner = (np.abs(np.diff(a, axis=1)).mean() + np.abs(np.diff(a, axis=0)).mean()) / 2
    return edge / max(inner, 1e-6)


def blur_wrap(a: np.ndarray, sigma: float) -> np.ndarray:
    """Separable Gaussian blur that wraps around the edges (keeps tiles seamless)."""
    r = int(sigma * 3) + 1
    x = np.arange(-r, r + 1)
    k = np.exp(-(x**2) / (2 * sigma**2))
    k /= k.sum()
    out = a
    for axis in (0, 1):
        p = np.pad(out, [(r, r) if i == axis else (0, 0) for i in range(2)], mode="wrap")
        out = sum(k[i] * np.take(p, np.arange(i, i + a.shape[axis]), axis=axis) for i in range(len(k)))
    return out


def median_wrap(img: Image.Image, size: int) -> Image.Image:
    pad = size
    p = np.pad(np.asarray(img), pad, mode="wrap")
    m = Image.fromarray(p, "L").filter(ImageFilter.MedianFilter(size))
    return Image.fromarray(np.asarray(m)[pad:-pad, pad:-pad], "L")


def crossfade_wrap(a: np.ndarray) -> np.ndarray:
    """Hide residual seams: edges take the half-rolled image, centre the original."""
    n = a.shape[0]
    t = np.abs(np.linspace(-1, 1, n))  # 0 centre .. 1 edge
    m = 0.5 + 0.5 * np.cos(np.pi * np.clip((t - 0.5) / 0.5, 0, 1))  # 1 inside, 0 at edge
    m2 = m[:, None] * m[None, :]
    return a * m2 + np.roll(a, (n // 2, n // 2), axis=(0, 1)) * (1 - m2)


def make_tile(tex_id: str, path: Path) -> np.ndarray:
    img = Image.open(path).convert("RGB").resize((TILE, TILE), Image.Resampling.LANCZOS).convert("L")
    if tex_id in MEDIAN:
        img = median_wrap(img, MEDIAN[tex_id])
    a = np.asarray(img, dtype=np.float64)
    if tex_id in BLUR:
        a = blur_wrap(a, BLUR[tex_id])
    if tex_id in FLATTEN:
        a = a - blur_wrap(a, FLATTEN[tex_id])
    before = seam(a)
    if before > 1.15:
        a = crossfade_wrap(a)
    lo, hi = np.percentile(a, [2, 98])
    a = np.clip(a, lo, hi)
    z = (a - a.mean()) / max(a.std(), 1e-6)
    k = SOFT.get(tex_id, SOFT_DEFAULT)
    z = np.tanh(z / k) * k
    z = (z - z.mean()) / max(z.std(), 1e-6)
    out = np.clip(np.rint(z * TARGET_STD[tex_id] + TARGET_MEAN), 0, 255)
    s = seam(out)
    print(f"  {tex_id}: seam {before:.2f} -> {s:.2f}, mean {out.mean():.1f}, std {out.std():.1f}")
    if s > MAX_SEAM:
        raise SystemExit(f"{tex_id}: wrap-edge seam ratio {s:.2f} > {MAX_SEAM}")
    return out.astype(np.uint8)


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "assets/terrain/atlas.png"
    atlas = np.full((TILE * GRID, TILE * GRID), 128, dtype=np.uint8)
    for i, tex_id in enumerate(SLOTS):
        r, c = divmod(i, GRID)
        atlas[r * TILE:(r + 1) * TILE, c * TILE:(c + 1) * TILE] = make_tile(tex_id, find(src, tex_id))
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(atlas, "L").save(out, optimize=True)
    print(f"wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
