# Settlement strategy: design document

Date: 2026-11-16. The game's working title has not been chosen yet.

The mark **[my decision]** means that Claude suggested the item, not the author. It can be challenged.

---

## 1. What this game is and why

A real-time strategy with pause on a living world map. The player starts with one small settlement in a random place, fog all around. They grow it into a country: extract resources, build, research technologies, trade, fight and negotiate with neighbours. The neighbouring countries live by the same simulation as the player's country, only a computer runs them.

It is a blend of two ideas:
- **From WorldBox:** the world lives on its own, events happen in it, peoples grow and die without the player's involvement.
- **From Hearts of Iron / Europa Universalis:** small provinces, crisp borders, technologies, armies and diplomacy.

Later, on top of the same world, a **god mode** will be added: look at the whole map, draw it and intervene with powers. This version does not have it, but the architecture must allow adding it without a rewrite (see section 9).

**Why this way.** Previous attempts (letopis-mirov, glowing-octo-fishstick) came out "so-so": many mechanics at once and none finished, the picture looks homemade. This project is built from one playable mode, stage by stage, and it must look like a real strategy game.

## 2. Goals, non-goals, anti-goals

**Goals**
- A playable settlement mode: from one province to victory.
- A map on the HoI4 level: beautiful terrain, crisp borders, no pixels.
- A world that lives on its own: neighbours grow, fight, trade, survive events.
- Two victory goals to choose from and difficulty levels.
- Fantasy as an option when creating the world.

**Non-goals of this version (may appear later)**
- God mode.
- Online (but the code must allow it).
- Zooming into a city with individual houses placed (option "C").
- Manual control of every unit and front lines as in HoI.
- Mobile devices. Only a PC with a mouse and a keyboard.

**Anti-goals: even if everything works, this is a failure**
- Many mechanics, but none interesting. A new mechanic is added only when the previous one is already playable.
- The picture looks "AI-made": neon, cyberpunk, gradient cards, the Inter font, procedural circles instead of sprites, pixelated borders.
- Once everything is built, there is nothing to do (no goal and no pressure).
- The code turns into a few huge files that AI can no longer edit without breaking things.

## 3. Constraints

- Development is mostly by AI. Hence the stack, the file size limit (roughly up to 400–500 lines) and mandatory debugging tools.
- Graphics, icons and fonts — ready-made assets only, with a suitable licence (CC0, CC-BY or purchased). The code draws the map with shaders, but does not "draw" units and icons itself.
- The interface language is Russian. **[my decision]** We move the texts into separate files right away, so English can be added later.
- We start from scratch. Code from the old repositories is not carried over, only ideas may be taken. The old glowing-octo-fishstick repository will be emptied or replaced by a new one, decided at the planning stage, with separate confirmation.

## 4. How we build it: the approaches considered

| Approach | Pros | Cons |
|---|---|---|
| **TypeScript + PixiJS (WebGL) in the browser** — chosen | AI writes TS best and can check the game in the browser itself; runs from a link; online through WebSocket | No editor, we write the interface and the plumbing ourselves |
| Godot 4 | An editor, interface themes, networking out of the box | AI makes more mistakes in the Godot API and scene files, checking only through screenshots |
| Unity and the like | Powerful | Too heavy for such a game, even worse for AI development |

The first option was chosen because the main risk of the project is the quality of AI-written code, and a beautiful map comes from the shader and the assets, not from the engine.

## 5. Game design (what is decided)

### 5.1 Starting a match
The world creation screen:
- seed (a world from the same seed is always the same);
- world size;
- fantasy: on/off;
- the player's race (only if fantasy is on);
- the goal: Conquest or Departure;
- difficulty.

The player appears in a random suitable province (land, not a desert and not a glacier, there is food). The whole map is under fog except the starting province and its neighbours.

**[my decision]** The world is generated procedurally from the seed every time instead of being drawn by hand. This is needed for the random start and will be useful in god mode.

### 5.2 Map and provinces
- Small provinces, as in HoI: **2–4 thousand** per world. A medium-sized country — a few dozen provinces, the starting settlement — one.
- A province has a biome, terrain, resources, population, owner, buildings, culture and religion.
- Biomes: ocean, coast, plains, forest, taiga, tundra, desert, steppe, swamp, mountains, hills, jungle. With fantasy, for example, a magic forest, ash wastes, crystal mountains are added (the final list is a content task).
- Rivers follow the terrain and affect fertility and trade.
- **Provinces are cut along the terrain** (decided 2026-11-17, needed for bonuses and penalties):
  - major rivers (width ≥ 2) are always a border between provinces, a province never crosses them; this is the basis for the "attack across a river" penalty; small streams may flow inside a province;
  - mountains — separate mountain provinces, the edge of the massif and the ridges are borders; the basis for a defence bonus and slow passage;
  - a province has one terrain type: at least 80% of its cells are of one biome; bonuses and penalties are counted by the province type; small inclusions of another biome are allowed inside;
  - borders are winding, without straight segments at 0/45/90°.
- Fog of war: the unexplored is hidden, what is explored but not currently visible is shown without the current armies.

### 5.3 Economy and population
- The resources of a province depend on the biome: grain, fish, timber, stone, iron, gold; later coal, oil; in fantasy — magic resources (for example, mana crystals).
- A province has **slots for buildings** (the number depends on the size and the development): farm, sawmill, mine, housing, temple, barracks, market, library and so on. The list opens up with technologies.
- Population grows if there is enough food and housing. People work in the buildings. A lack of food leads to famine, overpopulation — to disease and discontent.
- Money comes from taxes and trade.
- Religion and culture of the provinces: they affect contentment, revolts and relations with neighbours.

### 5.4 Expansion
- Scouts open up the map.
- Free lands are taken by settlers (they cost resources and people).
- Foreign lands are taken by war or by agreements (for example, vassalage).

### 5.5 Technologies
- A tree by eras: stone age → bronze → iron → middle ages → industry → space.
- Research points are given by population and buildings (libraries, temples, universities).
- Several researches run in parallel, each takes time (an idea from HoI). The structure of the tree itself is closer to Civilization.
- Technologies unlock buildings, weapons, units, bonuses, means against disasters (for example, medicine against epidemics).
- Discoveries gradually spread to neighbours through trade and contacts. Falling behind is dangerous.
- The last era unlocks the rocket project, this is the path to the "Departure" victory.
- With fantasy there is a separate magic branch.

### 5.6 Army and war
- Armies are figures on the map that move through provinces.
- Control is **semi-automatic**: the player gives an army a task ("defend the eastern border", "advance on the neighbour's capital"), the army gathers, moves and fights on its own.
- Battles are calculated automatically: numbers, technologies, terrain, general, supply.
- The player's influence on the war comes through upgrades: the general staff, generals with skills, doctrines, weapon technologies.
- Captured provinces pass to the conqueror by the outcome of the war or right after occupation **[my decision: right after occupation, simplified, for the first version]**.

### 5.7 Diplomacy and trade
- Relations with every country: peace, a trade agreement, an alliance, war, vassal.
- Trade routes are visible on the map: caravans and ships between cities. A route can be cut by war or plunder.
- Computer countries do the same among themselves.

### 5.8 Events
Epidemics, famine, revolts, meteorites, a golden age, the appearance of monsters (in fantasy). The frequency depends on the difficulty. Some events are prevented or mitigated by technologies and buildings.

### 5.9 Fantasy
- A checkbox when creating the world.
- Off: only humans, different cultures, realistic biomes, no magic and no monsters.
- On: a choice of the player's race (humans, gnomes, dwarves and others, the list is being written), fantasy biomes, a magic branch, magic resources, monsters.
- Every race has its own bonuses and preferences. Example: dwarves are strong in the mountains and mines but grow slowly.

### 5.10 Victory and defeat
- **Conquest:** capture the whole world or a given share (depends on the difficulty) **[my decision: the share is set when creating the world]**.
- **Departure:** build a rocket and fly away with the people. This is a race: the neighbours may also reach space, and then the player loses.
- **Defeat:** the last province is lost, or the neighbours fulfilled the goal earlier.
- The difficulty affects the strength of the neighbours, the frequency of disasters and the amount of resources.

### 5.11 Time
Real time with pause and several speeds, as in HoI/EU. Pause on the space bar. **[my decision]** The base unit of time is a day, the date is shown on the map.

## 6. Appearance

- **A map in the spirit of HoI4.** The terrain looks painted: mountains with shadows, forests, rivers, soft transitions between biomes, muted "paper" colours. Country borders are smooth coloured fills with crisp lines. No pixels at any zoom.
- **A living map.** Towns grow with the population, little people walk around, caravans and ships travel the trade routes, armies march.
- **Assets.** Sprites, icons, units and fonts come from ready-made packs with a suitable licence. Claude picks the options, the author chooses. All assets and their licences are written into `assets/CREDITS.md`.
- **Interface.** **[refined by the author 2026-11-17]** Restrained, the way a designer with taste would do it, without imitating a specific game: calm dark neutral panels, a 1px border, good padding and alignment, hierarchy through size and weight, one restrained accent colour, simple functional labels. Font PT Sans (ParaType, OFL). Everything that betrays the "AI look" is forbidden: ornaments and dividers with diamonds, centred headings with letter spacing, a "tree" of gradients, gold on everything, glowing segmented strips, poetic labels, glassy and rounded gradient cards, neon, Inter and system-ui, emoji.

## 7. Technical architecture

- **Stack:** TypeScript (strict), Vite, PixiJS (WebGL). **[my decision]** The interface is plain HTML/CSS on top of the canvas, without ready-made UI libraries with a recognizable "AI look".
- **Simulation separate from rendering.** The simulation does not know about PixiJS and the DOM. **[my decision]** It runs in a Web Worker and sends state snapshots to the renderer.
- **Determinism.** The same seed and the same list of player commands always give the same world. All randomness goes through our own seeded random number generator, no `Math.random()` and no dependence on real time in the simulation. The player changes the world only with commands (`build`, `research`, `setArmyTask`, …). This is the basis of future online play and replays. **[decision 2026-11-19]** The game logic (`src/game`) does not call the `Math` functions that browsers compute approximately (enforced by the linter), and by agreement keeps the quantities in the economy in integers or fixed point; when entering an online match the players compare the build and content version and the world hash `worldHash`: if it does not match, the host sends the world (in more detail — `docs/architecture.md`, "Readiness for stage 2").
- **The map is drawn by a shader.** The generator builds the provinces and bakes a texture with the province numbers. From it the shader draws crisp borders of any thickness, country fills and fog. The terrain is a blend of biome textures plus shadows from the height map.
- **The neighbours' AI** uses the same commands as the player.
- **Saving:** a binary snapshot of the world arrays plus the match state in JSON, or seed + `GEN_VERSION` + content version + the list of commands (in more detail — `docs/architecture.md`, "Readiness for stage 2").
- **Debugging from the first stage:** a statistics panel (population, food, wars, years), speed-up, revealing the whole map, triggering an event by hand.
- **File size:** roughly up to 400–500 lines. Longer — we split.

### 7.1 Content as data and packs

**[author's decision 2026-11-17]** Game content is described by data, not scattered across the code. The generator, the simulation and the shader work with what is in the registry and do not know specific names.

- **A pack** is a `src/content/packs/<id>/` folder with a manifest: id, name, version, lists of content and overrides of content fields from other packs. A pack may add new entries and change the fields of existing ones (colour, name, appearance conditions). Examples of future packs: "World War II", "Modern age".
- **What the pack contains now:** biomes — id, name, fantasy flag, palette colour, detail texture slot, climate niche (ranges of height, temperature, moisture, the "magic" field) with a priority, role tags (mountains, hills, deep/shallow water), groundwork for modifiers (defence, movement cost).
- **What will come later:** resources, buildings, technologies, units, races, events — by the same rules.
- **Enabling.** The list of packs and enabled biomes (including the "fantasy" checkbox) is set when creating the world and stored in the world. For now — through the page address (`#seed?fantasy=1`), the world creation screen will appear at stage 8. A disabled biome yields its niche to the next one by priority.
- **Loading** is static: packs are imported in code, without a file system or network. External (user) packs — some time later.
- The biome code in the world data is the number in the list of biomes enabled in this world, so adding a biome does not break old worlds with the same set of packs.
- Instructions for content authors — `docs/modding/biomes.md`.

### 7.2 The world description and the generation version

**[author's decision 2026-11-17]** The world is fully defined by `WorldParams = { genVersion, seed, packs, options: { fantasy, disabledBiomes, size } }`; the parameters are stored in the world and encoded in the page address (`#Бета-7?fantasy=1&size=medium`). `genVersion` is a constant in the code, it is **mandatory** to bump it on any generation change that alters the result; a "fingerprint" test (a hash of the world arrays for fixed parameters) reminds about it. Saves of future stages store `WorldParams`; if the version does not match, the game honestly reports that the world was built by a different generator version.

The world size is a parameter: small 1024×512, medium 2048×1024 (default), large 3072×1536; the number of provinces grows with the land area.

### 7.3 Province adjacency and map modes

- The adjacency graph stores edges with a border type: length, "along a major river", "across a narrow strait" (≤ 3 cells of water). This is the basis of future bonuses and penalties (attack across a river, landing across a strait, a mountain pass).
- The map gets a small "province → colour + flags" texture that can be changed on the fly without rebaking the world. The shader blends it with the terrain depending on the map mode. Modes are data (id, name, a province colour function): now "terrain" and "provinces", later owner, fog of war, resources, religion, target highlights.
- All hotkeys are in one registry (action, key, name for the tooltip).

### 7.4 The map editor and god mode: how they will be built

We are not making the editor itself, but the data is separated so that it is possible:

- **Source world data:** height, temperature, moisture, the "magic" field, biomes, rivers, provinces and the adjacency graph. The user edits only these and only these need to be saved.
- **Derived data:** the terrain and biome colour textures, normals, distance fields to the borders and the coast, the smoothed height. They are built by one function from the sources and can be recomputed for a rectangular region with a partial texture upload.
- **Changed a cell** (height or biome): the derived data are recomputed in a rectangle around it with a margin for the blur radius, then that part of the textures is updated. If the cell became water/land — the coastal fields are recomputed in the same region.
- **Changed the provinces** (repainted cells, merged or split): `provinceOf` is recomputed in the region, the distance field to the borders in the region, the province list (centre, biome, coastalness) and the adjacency graph edges of the affected provinces; the province data texture is updated for the affected ids.
- **God mode** works on top of the same simulation: a full overview (a map mode without fog), drawing biomes and provinces through these functions, "powers" — simulation commands, like the player's.

## 8. Development order: milestones and sub-stages

**[author's decision 2026-11-20]** Development goes by **milestones**, each split into **sub-stages**. Every sub-stage ends with a small but finished, polished result the author can open and look at; raw work between sub-stages is not shown. The detailed plan of each sub-stage is written separately.

**Sub-stage rule.**
1. The mechanic, with a simple test right away.
2. Polish: the look by `docs/visual-checklist.md`, convenience, balance.
3. Before/after screenshots and a short "what to look at" note for the author.
4. The author looks when convenient; notes about this sub-stage are fixed before moving on.

**"Polished before showing" checklist.** Nothing looks temporary (no placeholder squares, no English text, no errors on screen); 60 FPS on the full map; five different seeds checked by the visual checklist; a 15–20 minute match passes without obvious breakage or boredom (there is always a goal and a threat); before/after screenshots of every look change.

**Why this order** (changed from the first draft). Pressure must come early: seasons, famine and disease already in milestone 1, rivals and war in milestone 2. War goes before technologies: technologies only matter when there is a rival to outpace. The first complete match (Conquest victory and defeat) comes at the end of milestone 2. From milestone 1 a headless "bot plays 100 years" test runs the simulation without a screen and catches breakage and runaway balance.

0. **The map** (done: stages 1 and 1.5). World generation from a seed, HoI4-style shader rendering, zoom and pan.

**Milestone 1 "Own tribe"**
- 1.1 **Time and start.** Date on the map, pause on space, 3–5 speeds; start in a random province, fog around, only neighbours visible. Polish: a soft "paper" fog edge, smooth reveal at start, top bar in our style.
- 1.2 **The settlement lives.** Population, food, wood, stone rise and fall on their own; province panel on click (numbers, building slots); a town sprite on the map grows with the population. Polish: the chosen icon pack, clear tooltips, readable numbers.
- 1.3 **Buildings and seasons.** Farm, sawmill, housing, storehouse, construction takes time; winter, famine, overcrowding and disease; event feed bottom right. Polish: balance so the first 10 years are interesting, a noticeable but calm season change on the map.
- 1.4 **Scouting.** A scout walks provinces and lifts the fog. Polish: the path is visible, the figure moves smoothly, the fog melts nicely.
- 1.5 **Expansion.** Settlers take free land; several provinces, taxes and money, the "owner" map mode with a country fill and a crisp border. Polish: HoI4-style country border, a handy list of own provinces.
- 1.6 **Milestone polish.** Save and load, five seeds, 60 FPS, a 15–20 minute match.

**Milestone 2 "Living world and war"**
- 2.1 **Neighbours appear.** 10–20 tribes with their own colours grow and take land. Polish: distinct country colours, country names curved along the territory as in HoI4.
- 2.2 **Relations.** Peace or war, declaring war, a country window (size, strength, attitude). Polish: it is clear who is dangerous.
- 2.3 **Armies and movement.** Recruiting, army figures, movement through provinces, tasks ("defend the border", "advance on the capital"). Polish: smooth movement, readable strength badges, order arrows.
- 2.4 **Battles and capture.** Automatic battles with rivers, mountains and straits; provinces pass to the winner. Polish: a visible battle animation, a clear outcome ("why I lost").
- 2.5 **Victory, defeat and milestone polish.** Conquest victory and defeat — the first full match; a results screen, AI balance, a long "bot plays 100 years" run.

**Milestone 3 "Eras"**
- 3.1 **Technology tree.** Eras, several researches at once, a good-looking tree screen.
- 3.2 **Knowledge and lagging behind.** Discoveries spread to neighbours; technologies affect armies and construction.
- 3.3 **Trade.** Agreements, caravans on the map, routes cut by war.
- 3.4 **The sea.** Seafaring, ships, carrying armies and settlers.
- 3.5 **Diplomacy.** Alliances and vassals; AI countries negotiate among themselves.
- 3.6 **Events and milestone polish.** Epidemics, revolts, golden age; technologies that protect against them.

**Milestone 4 "Full game"**
- 4.1 **World creation screen.** Seed, size, difficulty, goal.
- 4.2 **Departure victory.** Late eras, the rocket, the race with neighbours; the launch shown on the map.
- 4.3 **Difficulty and balance of the whole match.**
- 4.4 **Menu, settings, sound** and the final polish of the whole game.

**Milestone 5 "Fantasy"**
- 5.1 Magic lands and resources.
- 5.2 Races with bonuses.
- 5.3 The magic technology branch.
- 5.4 Monsters and milestone polish.

The old stage numbers map as follows: "stage 2" (one settlement) = 1.1–1.3; "stage 3" (expansion) = 1.4–1.5; "stage 4" (neighbours) = 2.1–2.2; "stage 6" (war) = 2.3–2.5; "stage 5" (technologies) = 3.1–3.2; "stage 7" = 3.3–3.6; "stage 8" = milestone 4; "stage 9" = milestone 5.

## 9. For the future (not doing it now, but not getting in the way)

- God mode: the same simulation, a full overview, drawing the map, powers.
- Online: thanks to determinism and commands, synchronisation can be done by exchanging commands.
- Zooming into your own city with houses placed (option C).

## 10. Small decisions made while checking the document

- **[my decision]** The world is a rectangle without wrapping at the edges. Several continents and islands.
- **[my decision]** At the start there are 10–20 other tribes in the world (depends on the world size), scattered the same way as the player. Everyone starts with one province and equal conditions, the difficulty changes only their bonuses.
- **[my decision]** You can cross the sea after the seafaring technology: ships carry armies and settlers. Before that the overseas lands are unreachable.
- **[my decision]** Rendering is designed for 60 frames/s with 4 thousand provinces on an ordinary laptop, the simulation — at least 1 game month per second at maximum speed.

## 11. Left to the developer's discretion

- The exact formulas of growth, combat, trade, the balance of the numbers.
- The province generation algorithm (Voronoi, flood fill from the centres along the terrain, etc.) if the result looks crisp and beautiful.
- The full list of buildings, technologies, resources, events and races. Filled in stage by stage.
- Specific asset packs: offered to the author at the stage where they are needed.
