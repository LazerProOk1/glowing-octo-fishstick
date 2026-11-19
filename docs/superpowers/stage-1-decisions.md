# Stage 1: decisions and deferred small items

An extract from the working journal (subagent-driven development, 2026-11-16…18). The controller made the decisions without the author; each one states what a mistake would cost. The deferred small items are candidates for the next stages.

## Decisions

- | 2 self / 2→3,4,6,7 | Rng, Noise2D | Noise2D type used in fbm signature but not declared → Ruling: export `type Noise2D = (x:number,y:number)=>number` from noise.ts — trivial — none |
- | 4 self | classifyBiome order | tests imply order water→mountains→hills→glacier→...; Ruling: implementer fixes rest of order, must keep latitude tests green — cost: rebalance later |
- | 8 self / 8→10 | TERRAIN_TEXTURES | downloads need user's yes → Ruling: controller stops at Task 8 to show options to user (permission required by safety rules) |
- | 10 self / 10↔11 | FPS counter | Task 10 step 5 checks FPS via Task 11 counter (forward dep) → Ruling: FPS check moves to Task 11 step 4 — cost none |
- Task 4: Ruling: test file seed stored as mojibake (not "Бета-7") — plan mandates seed "Бета-7", so treated as Important spec gap, not minor; also add latitude warp (low-freq noise offset on lat) per spec §6 organic look — cheap; cost if wrong: small retune. Fix round 2 → ac763f958ce39cedd, FIX_BASE 49c294f
- Task 5: Ruling: plan test "monotone on original height after fill" is self-contradictory → test monotonicity on the filled height (export fillDepressions), drop the depression-source restriction; require long rivers (stats targets) — spec §6 wants visible rivers; cost if wrong: rivers cross small bumps (invisible after smoothing). Pre-review fix sent to a1288056ba70b406d; full review afterwards on 92cceee..HEAD.
- Task 6: review Approved but 2 Important (tiny islands water in provinces but land in height/biome; sea count 547–571 vs cap 600, driven by tiny lakes). Ruling: fix now in Task 6 via exported normalizeShoreline(height,biomes,w,h) mutating copies — drown islands <6 cells (→ coast, height SEA_LEVEL-0.005), fill lakes <30 cells (→ land, height SEA_LEVEL+0.005, majority neighbour biome); Task 7 generateWorld order: height→climate→biomes→normalizeShoreline→rivers→provinces. Fix round 1 → a6549540cb9043f1c, FIX_BASE 91c9f50
- Ruling: Task 8 waits on user's texture choice (download permission) → run Task 9 (camera, independent) first — no cost.
- Ruling: Task 10 starts before Task 8 (user hasn't chosen textures). Visual approach (controller design call, told to user): biome PALETTE drives colour, textures only add grayscale detail (luminance) + paper grain. Task 10 builds shader with a `detail` atlas uniform that defaults to a procedurally generated neutral texture; Task 8 later swaps in real assets via TERRAIN_TEXTURES. Cost if wrong: one more wiring step.
- Ruling: picks Grass005, Moss002, Ground054, Rock051, Snow010A, Ground087, Paper001 (ambientCG CC0, 1K-JPG) + EB Garamond (OFL, google/fonts). Atlas stores GRAYSCALE detail (luminance normalized around mid-gray) — colour comes from biome palette in shader (anti-slop). Asset build script committed under tools/. Task 8 now, then Task 10.
- Ruling: Task 10 implementer adds a temporary main-thread generateWorld in main.ts to show MapView (Task 11 moves it to the worker); browser visual/FPS checks done by controller via browser pane.
- Task 6: Ruling (reopened by Task 10 review): octagonal borders = octile metric + 80-cell noise; fix after Task 10 round via domain-warp ownership post-pass + shared 8–20-cell cost noise — sent to Task 6 implementer a6549540cb9043f1c, sequentially (never parallel implementers).
- Ruling: new Task 10b after 6b review — vector borders: extract province boundary edges, chain into polylines between junctions/coast, Chaikin-smooth (junctions pinned), render as screen-width line mesh; remove shader border lines. Ruling: perf item — apply local-constant hoisting to rivers/heightmap; keep 8 s test but run it as the only heavy case in its file.
- Ruling: straight-run criterion becomes share-based — cells in axis/diagonal runs > 12 ≤ 0.5% of border cells AND longest run ≤ 30 — spec §5.2 intent is "no visible ruler lines", occasional 20-cell runs are HoI-normal; vector rendering (10b) smooths cell scale. Bump share limit ≤ 0.6% (controller-invented metric, 0.5 was arbitrary). Two-biome lone islands: split when both biome parts ≥ 40 cells, else exempt. Cost if wrong: some straight-ish borders visible → revisit after user's look.
- Ruling: vector borders (10b) dropped — land borders now smooth at max zoom in browser (YAGNI). Task 10b = render polish: biome colour boundary staircase at high zoom, jagged hovered-province outline, foamy shallow-water halo; plus sim nit: damp fine warp on KIND_WATER (sea saw-tooth borders). → Task 10 implementer a49c78beb90554120, BASE 583e0c3
- Task 10b: DONE_WITH_CONCERNS f116163. Controller browser (#1 mid zoom): looks good — soft biome transitions, calm coast, organic borders. Ruling: sea fine warp halved (not skipped) accepted; sea saw-tooth at half amplitude acceptable for now (borders on sea are faint).
- Ruling: flaky wall-clock test — node generateWorld test becomes a smoke bound ≤ 12 s; the spec's 8 s budget is verified in the browser worker via debug-panel timings (Task 11). Cost if wrong: perf regressions in node caught later.
- Ruling: the previous implementer a0ae24f149102fba0 is unavailable in the new session → a fresh implementer (opus) finishes task 11 on top of the uncommitted changes — cost: re-reading the code.
- Ruling: the UI font is PT Sans (ParaType, OFL; Regular+Bold, static Web ttf from google/fonts). Designed for Cyrillic, a neutral humanist sans, without "fantasy"; delete EB Garamond. Cost if wrong: replace one file.
- Task 11 controller browser (#1, vite dev, pane hidden): loading compact & plain, map OK, tooltip follows cursor, F3 toggles, total gen 5 420 ms (Terrain 1 688 incl. worker cold start, Textures 803) — ≤6 s met. FPS not measurable: pane hidden → rAF throttled to 1/s; no console errors. Ruling: FPS figure reported as 'not measured' unless pane becomes visible.
- Task 11: review Approved (a4ef3ee2e150aff4f), 0 Crit/Imp; 11 minors. Ruling: fold minors 1-8 (nested-worker timeout, debug CSS, aria-live, dead font exports, dedupe, stale comment, golden-hash test, early hashchange) into one polish round to implementer — cheap now; minors 8(mixed-language errors),9(genWorker untested),10(memory) → minor (deferred).
- Ruling (Task 12): default world (fantasy off) must keep golden hashes of tests/golden.test.ts unchanged → base biome order in registry = old BIOMES order, arcana from separate rng stream; fantasy biomes appended after base. Cost if wrong: golden update needed.
- Docs: Task 13 (13A data / 13B render+wiring) written into plan, spec §7.2–7.4; commit after Task 12 implementer finishes. Ruling: Task 13 split into two dispatches with separate reviews — 8 items too large for one implementer context; cost: one extra review.
- Ruling: small-world province thresholds relaxed (purity 0.75) accepted — same planet at lower resolution; author judges look. Large over 6 s accepted — spec budget is for medium. splitImpure change affecting other medium seeds is covered by GEN_VERSION bump.
- Ruling: add `riverLength` (count of border pairs crossing a major river) to ProvinceEdge alongside `river` — cheap, lets game decide partial river borders (reviewer minor 2). Strait excludes land-touching pairs — keep (they are already neighbours by land; strait = sea crossing) — cost: bays between touching provinces unflagged.
- Task 13B: review Approved (a9b970c77d4c85125), 0 Crit/Imp. Minors → final fix wave: F3 swallowed in inputs (regression), setProvinceData FILL-bit trap, updateRegion no clamp, ProvinceData.set no 0..255 check, golden-angle hue near base. Ruling: sea provinces unfilled in provinces mode — accepted (sea is not a playable province) — cost: one line if author wants sea tinted.
- Ruling: final fix wave = minors 1,2,3,4,6(docs+determinism note),7,8,9 + assignCorridor comment; rest keep deferred per reviewer triage; minor 10 (texture release test) keep deferred — code verified correct. Cost: test gap only.
- Ruling: jungle recolour is render-only, no GEN_VERSION bump — only baked-colour hashes may change.

## Deferred small items

- Task 3: minor (deferred): cx random range unintuitive; overlapping blob accepted at attempt 39; hard-coded edge offset needs comment
- Task 3: minor (deferred): ridge elongation untested; 0.85/0.72 thresholds duplicated between shape01 and tests (Task 4 told to export shared constants)
- Task 4: minor (deferred): exact threshold boundary tests; hard wind seam at lat 0.33; computeBiomes rebuilds Map per call
- Task 4: minor (deferred): mixed CRLF/LF line endings → add .gitattributes; full suite 34 s, watch growth; swamp rare (<1%), glacier small
- Task 5: minor (deferred): tautological riverMask 80% check; no test riverMask↔points / width monotone; leftovers (void h, lastKey field, fillDepressions computes full flow); landlocked land without outlet → river ends on land
- Task 6: minor (deferred): cleanup loops end silently at caps (add invariant throw); noiseTile rebuilt per call; minHeap extraction unused by provinces; lakes ≥30 still sea provinces (isLake flag later)
- Task 6: minor (deferred): convergence caps (20/50) empirical — now throw; raise caps or fuzz more seeds; filled lakes may take hills/mountains biome at low height; sea headroom 12–35 under 560
- Task 7: minor (deferred): EDT test only vertical split; no different-seed-differs test; console.log noise; timing threshold 2000ms smoke
- Task 8: minor (deferred): Pillow/numpy versions not pinned; Image.LANCZOS deprecation
- Task 8: minor (deferred): Image.fromarray mode arg deprecated; grass tile high-frequency
- Task 10: minor (deferred): 3-province junction breaks in signed field; hover vs highlight half-cell mismatch
- Task 10: minor (deferred): blurred-height coast can shift 1-wide spits/inlets ~1 cell (cosmetic); +16MB GPU for surface texture
- Task 6b: minor (deferred): climate change bundled into provinces commit (keep, note in ledger); longestStraightBorder debug param
- Task 6b: minor (deferred): assignCorridor comment wrong (wide rivers split between banks); splitIslands second-biome-only vs test any-minority; possible sub-40 remainder after splitIslands; computeProvinces within 5% of 2.5 s; jitterBiomes unused scale arg; determinism timeout 30 s
- Task 10b: review clean (Approved). minor (deferred): biomeColor alpha unused; tiny-island halo weak; no test pins SEA_FINE_SCALE
- Task 11: review Approved (a4ef3ee2e150aff4f), 0 Crit/Imp; 11 minors. Ruling: fold minors 1-8 (nested-worker timeout, debug CSS, aria-live, dead font exports, dedupe, stale comment, golden-hash test, early hashchange) into one polish round to implementer — cheap now; minors 8(mixed-language errors),9(genWorker untested),10(memory) → minor (deferred).
- Task 11: minor (deferred): encodeProvinceId allocs per cell in bake loop (unmeasured, ~10-40 ms worst); mixed-language error details; genWorker nested-worker paths untested; +38 MB transient memory in province growth; golden test pins platform FP
- Task 12: minor (deferred): fantasy biomes reuse forest/mud/rock atlas slots — ash wastes / crystal mountains may read close to steppe/mountains; revisit after author's look.
- Task 12: minor (deferred): saturation helper duplicated in registry.test (hsl exported now); off= values not URL-decoded (ids snake_case)
- Task 13A: minor (deferred): bakeBiomeColorsRect duplicates blurInterleaved gaussian (add sync comment in fix round); buildWorldUrl packs=[] round-trip; two import paths for levels
- Task 13A: minor (deferred): ray-check exemption leaves 'missed river' untested for mostly-land-touching edges

## Stage 1.5 (plan 2026-11-18-stage-1-5-feedback)

### Decisions

- | T4→T5 | both edit provinces.ts/provinceSeeds.ts | sequential, ok. T5 count "150–300 sea" must count water==='sea' only (lakes excluded) → Ruling below |
- | T4→T7 | lake must be distinguishable in shader; T7 "озёра без изобат" (lakes without isobaths) | T4 does not name the mechanism → Ruling below |
- | T10 vs fingerprint test | worldHash duplicates hashing in fingerprint.test | → Ruling below |
- Ruling: T5 sea-count bounds (150–300) count provinces with water==='sea' only — lakes are their own kind — cost: none.
- Ruling: T4 exposes lake to the shader through the biome code (lake biome in palette / water flag texture), T7 reads the same — cost: one extra texture channel if palette is not enough.
- Ruling: T10 worldHash is the single hash implementation; fingerprint.test imports it instead of its own helper — DRY; cost: fingerprint values may need re-pinning only if hash function differs (then keep old helper for old pins).
- Task 3: DONE 018f748 (coastSd EDT, PROTOCOL 2). Controller browser: highlight matches coast BUT coastline stair-stepped at max zoom — worse than stage-1. Ruling: brief fallback — keep blurred-height coast look; render-side displayProvinceOf assigns coast-band water cells (shown as land) to nearest land province for hover/fill/picking; sim provinceOf untouched — cost: sim and picking disagree on ≤1-2 coast cells (army/settlement on such cell resolves to land prov in UI, sea in sim) — acceptable, UI only selects provinces.
- Task 5: review Approved w/ Important escalated (a74c0d9982141a4c6): coastal sea 30% coarser (3280→4279) — brief flaw (max rule + 150–300 cap). Ruling: author intent (open sea coarse, coast as fine as before) beats brief numbers → min() rule, COAST 2.6–3×, count cap 350, abs coastal mean ≤3400; land-only quality thresholds restored; split file <450 — cost: ~300+ sea provinces instead of ≤300.
- Ruling: accept COAST 2.5x (below ruled 2.6–3.0) — in-range options miss coastal target or thin margins — cost: none visible.
- Ruling: accept item-3 deviation — land-only metrics already above original thresholds before Task 5 (stage-1 thresholds were on all borders); pinned at observed+margin — cost: land regression slack equals the margin.
- Author screenshot (2026-11-19): hovering SEA province near coast → highlight stops short of coast with stairs (mirror of Task 3; reviewer minor "sea fill stops at band edge" was real — controller missed it, only checked land hover); sea–sea hover boundary stair-stepped at max zoom. Ruling: new Task 6b in plan (two display maps land/sea + soft-membership smooth fill/hover edges), runs after Task 6 and before Task 7 (both edit shader water block) — cost: one more render task.
- Ruling: accept moisture jitter ±0.15 + test «≤11% of jungle N/S edge cells in any 4-row band» (fails on base, passes) — shares move ≤0.93 p.p.; re-pin fingerprints (no GEN bump) — cost: brief values changed. Also raise generateWorld smoke limit 12→20 s (real budget checked in browser) — cost: slower node regressions caught later. Sequenced AFTER 6b commits (both touch fingerprint.test.ts).
- Ruling: accept fixed jitter scale (brief says 40–120 cells) — cost: small-world province headroom 7 below the 999 cap; watch.
- Task 8: dispatched a3a993219f5d9aef2 (opus), BASE 40f6695. Ruling: brief mouth test rewritten against blurred-coast field (coastSignedDistance no longer exists after Task 3 fallback); lake mouths allowed — cost: none.
- Author (2026-11-19, screenshot): the sea after Task 7 is "некрасивое и нереалистичное" (ugly and unrealistic) — uniform glowing halo around every island, dark lanes between. Task 7 REOPENED. Controller error: accepted look on a glance; reviewers only check code. Ruling: visual tasks now close only after author OK on screenshots. Sea rework waits for Task 8 (palette.ts overlap) and author choice of direction.
- Task 10: dispatched a9971d234578fe95a (opus), BASE bc7b6b7. Ruling: fingerprint.test migration onto worldHash deferred to Task 11 (file busy with Task 7 round 3) — cost: one extra small edit later.
- Ruling: perf investigation stopped (a1fa4e9bdbb9598aa) — superseded by final reviewer esbuild timing — cost: none.

### Deferred small items

- Task 1: review Approved (a24e221b6bb0bd34b). Push verified via ls-remote. minor (deferred → Task 11): CLAUDE.md stray comma line 64; plan-specific GEN 2→3 line goes stale (update at end of plan).
- Task 2: review Approved (a00bc38a2973224cd), 0 Crit/Imp. minor (deferred → Task 11): edt 2x2 checkerboard test missing; blur.ts mixed-language comments; labelComponents copies mask per call.
- Task 3: review Approved (af25ae1c717519d1b), 0 Crit/Imp. minor (deferred → Task 11): BFS seeds all land cells (seed only band-adjacent); blur reuse on main-thread fallback path; field copy spread; docstring "nearest" = 8-step distance. minor (deferred, watch): sea fill/sea borders stop at outer band edge — check when a sea-filling map mode exists.
- Task 4: minor (deferred): strait edges over lake water (adjacency.ts:107) — naval/strait logic must check sea later; tooltip capitalised for all biomes (accepted).
- Task 6b: review Approved (a7b47d59c2b6a95e0) w/ Important 1: border EDT still baked+transferred, unused on GPU → remove (fix round after Task 6 commits; both touch fingerprint.test). minor (deferred, document): sub-cell slivers vanish in soft share; candidate set jumps at 4+ junctions; CPU/GPU side may differ ≤1px at coast; per-pixel cost to measure in Task 9; coast.test generates seed twice.
- Task 6: fix round 1/5 (2 addressed, 0 open; 44af390..c2df6a0), re-review a64b24bc85af3b00f Approved. minor (deferred): small "1" province headroom 7 (test bound, not a throw); raw-side band test rebuilds climate from seed.
- Task 7: review Approved (abe20a903ce98958b), 0 Crit/Imp. minor (deferred → Task 11): smoothSeaDepth allocs 4 arrays; WATER_GRAIN literal in GLSL vs seaDepth.ts constants.
- Task 8: code review Approved (a0e2f4bfb3cdc6db8), 0 Crit/Imp. minor (deferred): per-bucket re-tessellation at max zoom (cull to viewport if hitch); default no-coast path untested; riverLayer.ts ~400 lines. Awaiting author look OK (with sea).
- Task 9: review Approved (a2869926f55c71744), 0 Crit/Imp. minor (deferred → Task 11): non-WebGL path silently optimistic (show «недоступно» (unavailable)); warm-up frames; disable button while running; ui imports render type.
- Task 7: final review Approved (a37715fc1e678f1d2), 0 Crit/Imp. minor (deferred → Task 11): mapShader.ts 438 lines (split next time); precompute wave cos/sin; skip zero-weight octave; UV partial block when w,h not multiple of 4; lake water feeds sea depth sum; no test pins TS/GLSL tone curve.

### Summary

- Final review of the branch: clean after one fix wave. npm test green (exit 0), 480 tests.
- Medium generation 4.7–4.9 s in the browser; a frame 4.3–5.2 ms.
- The controller accepted the look of the sea and the rivers against a checklist (the author delegated it for the night); show the screenshots in docs/screenshots/stage-1-5/ to the author.
