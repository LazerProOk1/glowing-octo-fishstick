# Translation glossary

How the Russian documents and comments were rendered into English on this branch, so that the next
translation stays consistent. Terms are grouped by where they occur.

**Read the ⚠ marks as "check this one".** Those are the choices where more than one English word fits,
or where the English term is a judgement call rather than a standard one. Everything without a mark is
either a standard term or an identifier that must not change.

## Rules that override any term below

1. **Identifiers, file paths, field names, codes and keys never change.** `GEN_VERSION`,
   `LAKE_MAX_CELLS`, `SEA_DEPTH_SIGMA`, `biome.mushroom_forest`, `provinceOf`, `water === 'sea'` —
   copied character for character, including the backticks.
2. **Numbers, thresholds and ranges never change.** Only the decimal separator follows English:
   `4,7–4,9 с` becomes `4.7–4.9 s`.
3. **Data that the game matches or shows stays Russian.** Seeds (`"Бета-7"`), URL examples
   (`#Бета-7?fantasy=1`), strings from `src/i18n/ru.ts` (they are the interface), and the Russian
   text a test asserts on (`"слишком много провинций"`).
4. **Russian UI words quoted in prose stay in Russian, with the English meaning in brackets** when the
   sentence needs it: "the «Провинции» (Provinces) mode", "«Озеро · вода»".
5. **Quoted author's wording stays verbatim**, glossed in brackets: «некрасивое и нереалистичное»
   (ugly and unrealistic).
6. **Commit-message examples stay Russian.** They document the commit style this repo actually uses
   (`feat(sim): климат и биомы`), so translating them would make the instruction wrong.

## World generation and data

| English | Russian source | Note |
| --- | --- | --- |
| seed | сид, seed | The literal string; never translated inside code or URLs |
| degenerate seed | вырожденный сид | All-ocean, one continent, empty string |
| moisture | влажность | |
| arcana | «магическое» поле | ⚠ The field is `arcana` in code; in prose sometimes "the magic field". Pick one per document |
| biome code | код биома | Index into `world.biomes` |
| pack, manifest, override | пак, манифест, переопределение | |
| fallback biome | запасной биом | The one with `when: {}` |
| priority | приоритет | Higher is checked first |
| tag / role tag | тег, тег роли | `mountain`, `hill`, `deepWater`, `shallowWater`, `lake` |
| lake, sea | озеро, море | `Province.water: 'sea' \| 'lake' \| null` |
| shallow water, shoal | мелководье | |
| strait | пролив | `≤ 3` cells of water |
| bay | залив | |
| spit | коса | ⚠ Correct but rare; "sand spit" if the sentence is for a lay reader |
| river source, mouth, runoff | исток, устье, сток | |
| river bank, underlay | кромка, подложка | ⚠ In code the colour is `riverBank`; in prose I used both "edge" and "bank" — unify |
| splinter province | провинция-щепка | Tiny leftover piece of land |
| province, adjacency graph, edge | провинция, граф соседства, ребро | |
| coastal province | прибрежная провинция | `coastal: true` |

## Rendering

| English | Russian source | Note |
| --- | --- | --- |
| baking, to bake | запекание, запекать | Textures and derived data |
| derived data | производные данные | `buildDerived`, `updateDerivedRect` |
| distance field | поле расстояний | Felzenszwalb EDT |
| detail atlas slot | слот атласа деталей | `grass`, `forest`, `sand`, `rock`, `snow`, `mud`, `paper` |
| palette | палитра | |
| hill shading, lighting from the height map | тени от карты высот, освещение от нормали | ⚠ I settled on "lighting from the normal of the height map"; "hill shading" appears once, keep or drop it deliberately |
| paper grain | бумажная зернистость | |
| map mode | режим карты | |
| fill | заливка | The colour of a province in a mode |
| highlight | подсветка | ⚠ "hover highlight" and "highlight" both occur; the code says `setHoveredProvince` |
| soft membership, soft share | мягкая принадлежность, мягкая доля | ⚠ Invented term for sub-pixel province edges; "soft share" reads better in code-adjacent text |
| staircase, stair-stepped | лесенка | ⚠ Informal on purpose: it is the author's word for cell-sized steps |
| isobath | изобата | Depth contour |
| fog of war | туман войны | |
| untouched / unexplored / hidden | не разведано / не видно | `UNEXPLORED`, `HIDDEN` |

## Process, versions, review

| English | Russian source | Note |
| --- | --- | --- |
| fingerprint | отпечаток | The hash pinned in `fingerprint.test.ts` |
| bump `GEN_VERSION` | поднять `GEN_VERSION` | |
| world params, world hash | параметры мира, хеш мира | `WorldParams`, `worldHash` |
| snapshot | снимок | State sent to the renderer, or saved to disk |
| host | хост | The player who sends the world in an online match |
| groundwork | задел | ⚠ For "задел под будущее"; alternatives "headroom", "hooks for later" |
| still open / deferred | остаётся / отложено | Review findings |
| finding severity | Critical / Important / Minor | Fixed vocabulary, do not re-rank |
| pp (percentage points) | п.п. | ⚠ "pp" is terse; "p.p." if a document reads as prose |
| mojibake | кракозябры, мойибаке | Kept as "mojibake" (the technical term) |
| SDD journal, controller, implementer | журнал SDD, контроллер, исполнитель | Roles of the subagent-driven workflow |

## Terms worth a second pass

Marked ⚠ above, collected here with the reason:

- **arcana / "magic field"** — the field name is code, the prose name is not settled.
- **hill shading** — used once, next to the more literal "lighting from the normal of the height map".
- **river bank vs edge vs underlay** — three words for the dark outline drawn under a river; they
  describe two different things (`MAP_COLORS.riverBank` and the 40% wider underlay).
- **highlight vs hover highlight** — the shader uniform is `hoveredId`, the sentence sometimes says
  just "highlight".
- **soft membership vs soft share** — no standard term; the mechanism is "share of the province's
  cells in the pixel neighbourhood".
- **spit** — correct geomorphology, unfamiliar to a lay reader.
- **groundwork** — chosen for "задел"; check it does not read as "foundation work already done".
- **pp** — abbreviation, not a word.

## How to re-check one of these

`grep -rn "<term>" docs/` and look at the sentence around it. If two documents use two different words
for the same thing, the one used in `docs/architecture.md` wins, because that is the document a new
contributor reads first.
