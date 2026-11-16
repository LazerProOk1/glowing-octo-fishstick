# Credits

## Terrain detail atlas

`terrain/atlas.png` is a 2048x2048 grayscale atlas (4x4 tiles of 512x512), derived from the
ambientCG textures listed below (Color maps only: resized, converted to luminance, normalized).
Built by `tools/build-terrain-atlas.py`. Colour comes from the biome palette, not from the textures.

| Slot | Texture | Source | License | Used for |
|------|---------|--------|---------|----------|
| 0 | Grass005 | https://ambientcg.com/view?id=Grass005 | CC0 1.0 | plains, steppe detail |
| 1 | Moss002 | https://ambientcg.com/view?id=Moss002 | CC0 1.0 | forest, taiga, jungle detail |
| 2 | Ground054 | https://ambientcg.com/view?id=Ground054 | CC0 1.0 | desert detail |
| 3 | Rock051 | https://ambientcg.com/view?id=Rock051 | CC0 1.0 | hills, mountains detail |
| 4 | Snow010A | https://ambientcg.com/view?id=Snow010A | CC0 1.0 | tundra, glacier detail |
| 5 | Ground087 | https://ambientcg.com/view?id=Ground087 | CC0 1.0 | swamp detail |
| 6 | Paper001 | https://ambientcg.com/view?id=Paper001 | CC0 1.0 | paper grain, water |

License text: https://creativecommons.org/publicdomain/zero/1.0/

## Fonts

- `fonts/EBGaramond-VariableFont_wght.ttf`, `fonts/EBGaramond-Italic-VariableFont_wght.ttf`:
  EB Garamond, https://github.com/google/fonts/tree/main/ofl/ebgaramond
  (SIL Open Font License 1.1, full text in `fonts/OFL.txt`). Used for map labels and UI text.
- `fonts/OFL.txt`: license text of EB Garamond (SIL OFL 1.1).
