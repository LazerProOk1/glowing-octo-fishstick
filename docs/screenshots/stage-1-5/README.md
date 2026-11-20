# Stage 1.5 — "before / after" screenshots

"Before" — `docs/screenshots/stage-1/`, "after" — this folder. Branch `stage-1-map`, 2026-11-19.

| What | Before | After |
|---|---|---|
| Overview, seed 1 | `../stage-1/seed-1-overview.jpg` | `seed-1-overview.jpg` |
| Medium zoom, seed 1 | `../stage-1/seed-1-mid.jpg` | `seed-1-mid.jpg` |
| The "Провинции" (Provinces) mode | `../stage-1/seed-1-provinces-f3.jpg` | `seed-1-provinces-mode.jpg` |
| Land highlight near the coast | (a staircase — the author's screenshot) | `seed-1-max-land-hover.jpg` |
| Sea highlight near the coast | (a staircase — the author's screenshot) | `seed-1-max-sea-hover.jpg` |
| worldbox | `../stage-1/worldbox-overview.jpg`, `worldbox-mid.jpg` | `worldbox-overview.jpg`, `worldbox-mid.jpg` |
| Бета-7 with fantasy | `../stage-1/beta-7-fantasy-overview.jpg`, `../stage-1/beta-7-fantasy-mid.jpg` | `beta-7-fantasy-overview.jpg`, `-mid.jpg` |
| Small and large world | — | `seed-1-small.jpg`, `seed-1-large-f3.jpg` |

What changed in the picture:
- **Coast:** the highlight and the province fill reach the coastline without steps — both from the land side and from the sea side.
- **Sea:** colour by the real seabed depth (large shapes), a narrow light rim at the coast, barely visible wave ripple at close zoom. No halos around islands.
- **Lakes:** a separate water type, lighter and greener than the sea.
- **Sea provinces:** small near the coast, large in the open sea.
- **Rivers:** narrow towards the source, a dark edge, they reach the water.
- **Jungle:** the border no longer runs in a straight line along the latitude.

Numbers (this computer): medium world generation 4.7–4.9 s (limit 8 s); large 14.6 s (no limit was set for it);
a frame measurement 5.2 ms in the overview and 4.3 ms at maximum zoom (≈190–230 fps, target 60).

Known: the edges of sea provinces in the open sea are slightly jagged (a shape from generation, known since stage 1);
on the seed "Бета-7" with many islands the shallow water between them looks blotchy — it is adjusted by one parameter
(`SEA_DEPTH_SIGMA` in `src/render/seaDepth.ts`).
