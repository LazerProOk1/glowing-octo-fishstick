#!/usr/bin/env python3
"""Build assets/terrain/atlas.png: 4x4 grid of 512x512 grayscale detail tiles.

Usage: python tools/build-terrain-atlas.py <source-dir> [out.png]
<source-dir> holds the ambientCG *_Color.jpg maps (<ID>_1K-JPG_Color.jpg).
Colour comes from the biome palette in the shader; tiles carry only
luminance detail (mean 128, std ~28).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

TILE, GRID = 512, 4
TARGET_MEAN, TARGET_STD = 128.0, 28.0
# Slot order, row-major; remaining slots are flat 128.
SLOTS = ["Grass005", "Moss002", "Ground054", "Rock051", "Snow010A", "Ground087", "Paper001"]


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


def make_tile(path: Path) -> np.ndarray:
    img = Image.open(path).convert("RGB").resize((TILE, TILE), Image.LANCZOS).convert("L")
    a = np.asarray(img, dtype=np.float64)
    print(f"  {path.name}: seam ratio {seam(a):.2f} (~1 = seamless)")
    a = (a - a.mean()) / max(a.std(), 1e-6) * TARGET_STD + TARGET_MEAN
    return np.clip(np.rint(a), 0, 255).astype(np.uint8)


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "assets/terrain/atlas.png"
    atlas = np.full((TILE * GRID, TILE * GRID), 128, dtype=np.uint8)
    for i, tex_id in enumerate(SLOTS):
        r, c = divmod(i, GRID)
        atlas[r * TILE:(r + 1) * TILE, c * TILE:(c + 1) * TILE] = make_tile(find(src, tex_id))
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(atlas, "L").save(out, optimize=True)
    print(f"wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
