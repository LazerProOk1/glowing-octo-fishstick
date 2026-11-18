# Этап 1.5: доработки по отзыву автора — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть всё подтверждённое из `docs/feedback/stage-1.md` и убрать технические риски, которые иначе подорожают на этапах 2+ (поселение, экономика, армии, онлайн).

**Architecture:** Работа идёт поверх ветки `stage-1-map` (продолжаем её же). Сначала чистка без изменения результата (дубликаты, инфраструктура). Затем изменения мира: озёра, морские провинции, граница джунглей. Они меняют генерацию, поэтому `GEN_VERSION` поднимается один раз, до 3. Дальше идут правки только отрисовки (берег, море, реки), затем замер FPS, задел под детерминизм этапа 2 и пачка мелочей.

**Tech Stack:** TypeScript strict, PixiJS 8 (WebGL2, GLSL `#version 300 es`), Vite, Vitest, ESLint 9.

**Spec:** `docs/superpowers/specs/2026-11-16-settlement-strategy-design.md` (§5.2, §6, §7, §7.2–7.4). Отзыв автора: `docs/feedback/stage-1.md`. Решения этапа 1: `docs/superpowers/stage-1-decisions.md`.

## Global Constraints

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`; `any` запрещён.
- `src/sim/**` не импортирует `src/render/**`, `src/ui/**`, `src/worker/**`, `src/i18n/**`, `pixi.js`, DOM. Нет `Math.random`, `Date`, `performance.now`, `crypto`, `setTimeout`, `fetch`, `self`.
- Файл не длиннее ~450 строк.
- Все тексты интерфейса в `src/i18n/ru.ts`, по-русски.
- Стиль интерфейса сдержанный: тёмные нейтральные панели, рамка 1px, PT Sans, без орнаментов, неона, градиентных карточек и эмодзи.
- Карта в духе HoI4, приглушённые «бумажные» цвета. **«На любом зуме нет пикселей»** (spec §6).
- Производительность: 60 кадров/с на 4000 провинций; генерация medium до 8 с, в воркере.
- `GEN_VERSION` поднимается **ровно один раз** за этот план, с 2 до 3, в Task 4. Задачи 5 и 6 меняют мир в рамках той же версии 3 и только обновляют отпечатки в `tests/sim/world/fingerprint.test.ts`.
- Чистые рефакторинги (Task 2) обязаны оставить все отпечатки `fingerprint.test.ts` без изменений.
- Коммиты на `stage-1-map`, сообщения по-русски, в конце `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. После каждой завершённой задачи: `git push origin stage-1-map`. `main` не трогать, ветки не удалять.

## Review Focus

1. **Клик и наведение у берега:** точка, которая на экране суша, должна выбирать сухопутную провинцию, а не морскую. Проверка: тест в Task 3 (`coastAgreesWithCells`).
2. **Озеро у края карты или огромный внутренний водоём:** вода, касающаяся края карты, никогда не озеро; водоём больше `LAKE_MAX_CELLS` — море. Тест в Task 4.
3. **Мир, где почти всё вода или почти всё суша** (сиды из Review Focus этапа 1: `""`, `"Бета-7"`, вырожденные): переменная плотность морских провинций не должна давать 0 морских провинций у крошечного моря или больше 65535 id. Тест в Task 5 прогоняет 20 сидов.
4. **Смена сида туда-обратно** после изменений Task 4–6: мир побайтно тот же (детерминизм), отпечаток медиума обновлён осознанно один раз. Тест в Task 5.
5. **Замер FPS при скрытой вкладке:** замер не должен зависеть от `requestAnimationFrame`, иначе он врёт (так было в этапе 1). Тест в Task 9.

---

### Task 1: Инфраструктура — .gitignore, CLAUDE.md, пуш ветки

**Files:**
- Modify: `.gitignore`
- Create: `CLAUDE.md`
- Commit: `.claude/launch.json` (конфиг дев-сервера проекта)

- [ ] **Step 1:** Дополнить `.gitignore` строками: `.superpowers/`, `.claude/settings.local.json`, `.claude/worktrees/`, `coverage/`, `.vite/`, `*.local`, `.env`, `.env.*`, `__pycache__/`, `*.pyc`, `.DS_Store`, `Thumbs.db`, `*.tsbuildinfo`. Проверка: `git status --short` после `npm run build && npm test` не показывает новых неотслеживаемых файлов, кроме `.claude/launch.json`.
- [ ] **Step 2:** Создать `CLAUDE.md` (до ~80 строк, по-русски). Разделы:
  - что за проект, со ссылками на спек и планы;
  - команды (`npm run dev`, `npm test`, `npm run lint`, `npx tsc --noEmit`);
  - жёсткие правила (Global Constraints выше, коротко);
  - правило `GEN_VERSION` из `docs/architecture.md`;
  - где лежат журнал SDD (`.superpowers/sdd/<план>/progress.md`) и решения (`docs/superpowers/stage-*-decisions.md`);
  - политика git: коммиты по-русски, пуш рабочей ветки после каждой задачи, `main` не трогать;
  - «что делать после сжатия контекста»: прочитать журнал и `git log`, не переделывать сделанное.
- [ ] **Step 3: Commit** `chore: .gitignore, CLAUDE.md для сессий и сжатия контекста`. Затем `git push -u origin stage-1-map`. Ожидается, что ветка появится на origin.

### Task 2: Убрать дубликаты (чистый рефакторинг, мир не меняется)

**Files:**
- Create: `src/sim/geom/blur.ts`, `src/sim/geom/edt.ts`, `src/sim/geom/label.ts`, `src/content/color.ts`
- Modify: `src/render/normals.ts`, `src/render/distanceField.ts`, `src/render/biomeColors.ts` (или где живёт `bakeBiomeColorsRect`), `src/sim/world/climate.ts`, `src/sim/world/provinceSeeds.ts`, `src/sim/world/shoreline.ts`, `src/sim/world/provinces.ts`, `src/sim/world/provinceCleanup.ts`, `src/sim/world/provinceNoise.ts`, `src/render/mapModes.ts`, `src/content/registry.ts`, `src/sim/world/types.ts`, тесты, которые импортируют перенесённое
- Test: существующие `tests/**`, плюс `tests/sim/geom/*.test.ts`

**Interfaces:**
- Produces:
  - `gaussianKernel(sigma: number): Float32Array`
  - `blur(src: Float32Array, w: number, h: number, sigma: number): Float32Array`
  - `blurInterleaved(src: Float32Array, w: number, h: number, c: number, sigma: number): Float32Array` в `src/sim/geom/blur.ts`; render импортирует оттуда.
  - `borderDistance(cells: Uint16Array, w: number, h: number): Float32Array` в `src/sim/geom/edt.ts`; `src/render/distanceField.ts` реэкспортирует или удаляется. Task 3 и Task 5 используют именно эту функцию.
  - `labelComponents` и `labelByKey` в `src/sim/geom/label.ts` (одна реализация разметки связных областей); `shoreline.ts` использует её же.
  - `hsl(rgb): { h: number; s: number; l: number }` и `saturation(r, g, b): number` в `src/content/color.ts`; одна реализация вместо двух.

- [ ] **Step 1:** Найти все копии: размытие (`normals.blur`/`blurInterleaved`, `climate.blurRows`, гаусс внутри `bakeBiomeColorsRect`), разметку компонент (`provinceSeeds`, `shoreline`), цветовые хелперы (`mapModes.saturation`, `registry.hsl`, копия в `tests/content/registry.test.ts`). Перечислить их в отчёте с file:line.
- [ ] **Step 2:** Перенести в модули выше. Импорты `KIND_*` сделать прямыми: убрать паттерн `import { KIND_LAND as KIND_LAND_ } ... const KIND_LAND = KIND_LAND_`, если он не нужен для производительности. Если нужен, объяснить комментарием в одном месте. Уровни рельефа импортировать из одного пути (`src/content/terrainLevels`); реэкспорт из `types.ts` убрать.
- [ ] **Step 3:** Тесты для `src/sim/geom/*`:
  - `blur` сохраняет сумму с точностью 1e-4 на случайном поле 64×32;
  - `borderDistance` на шахматке 2×2 даёт 0.5 у центров клеток;
  - `labelComponents` на маске с двумя островами даёт 2 компоненты с правильными размерами.
- [ ] **Step 4:** `npm test`: все тесты зелёные, **отпечатки в `fingerprint.test.ts` не менялись** (`git diff tests/sim/world/fingerprint.test.ts` пуст). `npm run lint` и `npx tsc --noEmit` чистые.
- [ ] **Step 5: Commit** `refactor: общие размытие, EDT, разметка областей и цвета без дублей`, затем push.

### Task 3: Берег совпадает с провинциями (лесенка у подсветки и заливки)

Причина бага. Берег рисуется по размытой высоте (`bakeWorld.ts:30`, `mapShader.ts:231-235`), а провинции — по клеткам. Между гладким берегом и клеточной границей сухопутной провинции остаётся полоса «суши», которая на деле принадлежит морской провинции. В ней подсветка и заливка режима карты обрываются лесенкой, и клик по видимой суше выбирает морскую провинцию.

Решение. Береговую линию строить по знаковому расстоянию до границы «суша/вода» в клетках: `borderDistance` по маске суши (Task 2), знак плюс на суше. Так же, как сейчас строятся гладкие границы провинций. Размытая высота остаётся только для оттенка мелководья.

**Files:**
- Modify: `src/render/bakeWorld.ts`, `src/render/textures.ts`, `src/render/mapShader.ts`, `src/render/MapView.ts`
- Test: `tests/render/coast.test.ts`

**Interfaces:**
- Consumes: `borderDistance` из `src/sim/geom/edt.ts`.
- Produces: `coastSignedDistance(provinces: Province[], provinceOf: Uint16Array, w: number, h: number): Float32Array` в `src/render/bakeWorld.ts`. Значение больше 0 на суше, меньше 0 на воде, в клетках. Запекается в новый R16F канал/текстуру `uCoastSd`.

- [ ] **Step 1: Тест `coastAgreesWithCells`.** На мире `small` сида `"1"`: для каждой клетки `sign(coastSignedDistance) === (provinces[provinceOf[i]].isLand ? +1 : −1)`. Ещё один тест: на прямом береге (маска «левая половина суша» 32×8) значение в центре клетки у берега равно ±0.5.
- [ ] **Step 2:** Запустить и убедиться в FAIL (функции нет).
- [ ] **Step 3:** Реализовать функцию. В шейдере `landMask` и линию берега считать от `uCoastSd` так же, как `zeroDistPx` для границ. `surf.b` (размытая высота) оставить только для полосы мелководья. Подсветка (`mapShader.ts:303-304`) и заливка режимов теперь совпадают с берегом без отдельной маски.
- [ ] **Step 4:** `npm test`, `npm run lint`, `npx tsc --noEmit` чистые.
- [ ] **Step 5: Проверка в браузере (контроллер).** Сиды `#1`, `#worldbox`, `#Бета-7?fantasy=1`, максимальный зум у берега:
  - подсветка сухопутной провинции у моря доходит до линии берега без ступенек;
  - в режиме «Провинции» (M) заливка тоже доходит до берега без ступенек;
  - берег на максимальном зуме не стал зубчатее, чем на скриншоте `docs/screenshots/stage-1/seed-1-max.jpg`.

  Если берег стал заметно угловатее, контроллер решает: вернуть `landMask` от размытой высоты, а для подсветки и заливки дотягивать сухопутную провинцию до гладкого берега (ближайшая сухопутная провинция для клеток полосы). Решение записывается в журнал.
- [ ] **Step 6: Commit** `fix(render): берег по клеткам провинций — подсветка и заливка без лесенки`, затем push.

### Task 4: Озёра — отдельный тип воды (GEN_VERSION → 3)

Сейчас любой замкнутый водоём от 30 клеток становится морской провинцией с биомом «Океан». Для экономики (рыба, пресная вода) и армий (флот не должен «плавать» в озере) это неверно.

**Files:**
- Modify: `src/sim/world/types.ts`, `src/sim/world/provinces.ts` (или новый `src/sim/world/lakes.ts`), `src/sim/world/params.ts`, `src/content/packs/base/biomes.ts`, `src/i18n/ru.ts`, `src/ui/tooltip.ts`, `src/render/mapShader.ts` (цвет озера), `src/render/palette.ts`, `docs/modding/biomes.md`, `docs/architecture.md`
- Test: `tests/sim/world/lakes.test.ts`, `tests/sim/world/fingerprint.test.ts`

**Interfaces:**
- Produces:
  - `Province.water: 'sea' | 'lake' | null`, где `null` означает сушу; `isLand` остаётся;
  - `LAKE_MAX_CELLS = 6000`;
  - `findLakes(height: Float32Array, w: number, h: number): Uint8Array`, где 1 означает клетку озера;
  - биом `lake` в базовом паке (`kind: 'water'`), название «Озеро» в `ru.ts`;
  - подпись в подсказке «Озеро · вода».

- [ ] **Step 1: Тесты.**
  - `lake is inland water`: синтетическая карта 64×32, вода по краям и замкнутый пруд 10×10 внутри суши. Клетки пруда дают 1, остальная вода 0.
  - `water touching the map edge is never a lake`: залив, касающийся края, даёт 0.
  - `huge inland water is sea`: замкнутый водоём больше `LAKE_MAX_CELLS` даёт 0.
  - `lake provinces`: на `generateWorld` сида `"1"` medium у каждой провинции с `water === 'lake'` все клетки озёрные и биом `lake`. Ни одна провинция не смешивает озеро и море.
- [ ] **Step 2:** Запустить и убедиться в FAIL.
- [ ] **Step 3:** Реализовать. Озеро — 4-связная компонента воды, не касающаяся края карты, размером ≤ `LAKE_MAX_CELLS`. Провинции не растут через границу «озеро/море». Озеро меньше минимальной морской провинции — одна провинция. Поднять `GEN_VERSION` до 3. Обновить отпечатки с пометкой в отчёте. В `docs/architecture.md` добавить строку: «v3: озёра, плотность морских провинций, граница джунглей».
- [ ] **Step 4:** Шейдер: у озера чуть более светлая и зелёная вода, без морской «волны» и полосы мелководья шире 2 клеток.
- [ ] **Step 5:** `npm test`, lint, tsc чистые.
- [ ] **Step 6: Commit** `feat(sim): озёра — отдельный тип воды, GEN_VERSION 3`, затем push.

### Task 5: Морские провинции крупнее вдали от берега

**Files:**
- Modify: `src/sim/world/provinceSeeds.ts` (`poissonSeeds`), `src/sim/world/provinces.ts:19-21`
- Test: `tests/sim/world/provinces.test.ts`, `tests/sim/world/fingerprint.test.ts`

**Interfaces:**
- Consumes: `borderDistance` из `src/sim/geom/edt.ts` (расстояние до суши).
- Produces: константы в `provinces.ts`: `SEA_RADIUS_COAST = LAND_RADIUS * 2.2`, `SEA_RADIUS_OPEN = LAND_RADIUS * 6`, `SEA_RADIUS_FAR = 80` (клеток до суши, на которых радиус достигает `OPEN`). `poissonSeeds` принимает `seaRadiusAt: (cell: number) => number` вместо числа.

- [ ] **Step 1: Тесты.**
  - `fewer sea provinces`: medium сид `"1"` даёт от 150 до 300 морских провинций (сейчас около 440).
  - `coastal sea stays fine`: средняя площадь морских провинций, касающихся суши, не больше 0.6 от средней площади морских провинций без суши рядом.
  - `20 seeds`: прогон из Review Focus этапа 1, включая `""` и `"Бета-7"`. У каждого сида с морем есть хотя бы одна морская провинция, все id < 65535.
  - `determinism`: два запуска одного сида побайтно равны.
- [ ] **Step 2:** Запустить и убедиться в FAIL на `fewer sea provinces`.
- [ ] **Step 3:** Реализовать. Пуассоновское сэмплирование с переменным радиусом: кандидат принимается, если до каждого принятого морского семени расстояние не меньше `max(r(кандидат), r(семя))`. Сетку взять по `SEA_RADIUS_OPEN`. Сухопутные провинции не меняются. Обновить отпечатки (та же версия 3).
- [ ] **Step 4:** `npm test`, lint, tsc чистые; генерация medium в node не медленнее +10% от текущей (число в отчёте).
- [ ] **Step 5: Commit** `feat(sim): морские провинции крупнее в открытом море`, затем push.

### Task 6: Граница джунглей не идёт ровно по широте

На сиде `#1` граница джунглей — прямая горизонтальная линия длиной в сотни клеток.

**Files:**
- Modify: `src/sim/world/biomes.ts` (классификация), при необходимости `src/sim/world/climate.ts`
- Test: `tests/sim/world/biomes.test.ts`, `tests/sim/world/fingerprint.test.ts`

**Interfaces:**
- Produces: `classifyTemperatureJitter`: только для выбора биома температура смещается шумом fbm с амплитудой ±1.5 и масштабом 40–120 клеток, из отдельного потока `rng.fork('biomeJitter')`. Сами поля `temperature` в `World` не меняются.

- [ ] **Step 1: Тест `no straight biome edges`.** Medium сиды `"1"` и `"worldbox"`. Для каждой строки y считаем самую длинную серию подряд идущих x, где граница «джунгли/не джунгли» лежит между строками y и y+1. Максимум по карте не больше 25 клеток.
- [ ] **Step 2:** Запустить и убедиться в FAIL.
- [ ] **Step 3:** Реализовать смещение. Проверить, что доли биомов на сиде `"1"` изменились не больше чем на 3 п.п. каждая (числа в отчёте). Обновить отпечатки.
- [ ] **Step 4:** `npm test`, lint, tsc чистые.
- [ ] **Step 5: Commit** `fix(sim): извилистая граница джунглей`, затем push.

### Task 6b: Гладкая заливка и подсветка у берега и между провинциями

Добавлено 2026-11-19 по скриншоту автора. Наведение на морскую провинцию у берега. Найдены две проблемы:
1. Подсветка моря обрывается лесенкой, не доходя до берега. Причина: после Task 3 клетки прибрежной полосы в `displayProvinceOf` принадлежат суше, и морская провинция их теряет.
2. Граница заливки и подсветки между двумя морскими провинциями (и вообще между провинциями) — ступеньки по клеткам на максимальном зуме. Для цветов стран будет то же самое, а спек §6 требует «на любом зуме нет пикселей».

**Files:**
- Modify: `src/render/bakeWorld.ts`, `src/render/bake.ts`, `src/render/textures.ts`, `src/render/mapShader.ts`, `src/render/MapView.ts`
- Test: `tests/render/coast.test.ts`, `tests/render/bake.test.ts`

**Interfaces:**
- Produces:
  - `displaySeaProvinceOf(world: World, coast: Float32Array): Uint16Array` — зеркальная к `displayProvinceOf`. Сухопутная клетка, которая может выглядеть водой (у неё или у 8 соседей `coast < 0`), получает ближайшую морскую или озёрную провинцию. Водные клетки сохраняют свою провинцию.
  - Вторая текстура id (`provinceSeaRG`, тот же формат, что `provinceRG`) или два id в одной текстуре, на выбор исполнителя, с обоснованием.
  - В шейдере: где на экране суша (`landMask > 0.5`), id берётся из сухопутной карты, где вода — из морской. Подсветка, заливка режима и границы считаются от «своей» карты для каждой стороны берега.
  - Гладкая граница заливки и подсветки. Вместо зубчатой границы по клеткам — мягкая принадлежность: доля клеток провинции в окрестности пикселя (взвешенная, ядро примерно 2–3 клетки), порог 0.5, сглаживание в экранных пикселях. Тот же приём, что даёт гладкий берег из размытой высоты. Тонкие линии границ остаются как есть, если они уже гладкие.
  - CPU-выбор провинции (`MapView.hoverAt`) использует ту же логику, что шейдер: суша или вода в точке по размытой высоте, затем соответствующая карта.

- [ ] **Step 1: Тесты.**
  - `visible water picks a water province`: small, сид `"1"`. Каждая клетка с `coast < 0` в `displaySeaProvinceOf` указывает на провинцию с `water !== null`. Все водные клетки сохраняют свой `provinceOf`.
  - Существующий `visible land picks a land province` остаётся зелёным.
  - Тест выбора на CPU: точка на воде у берега даёт морскую провинцию, точка на суше у берега — сухопутную.
- [ ] **Step 2:** Запустить и убедиться в FAIL.
- [ ] **Step 3:** Реализовать. Отпечатки мира не меняются. Хеши текстур — только новые или изменённые, с объяснением в отчёте.
- [ ] **Step 4:** `npm test`, lint, tsc чистые. Время запекания на medium не больше +150 мс. Замер кадра (если Task 9 ещё не сделан — оценка в отчёте: сколько выборок текстуры на пиксель добавилось).
- [ ] **Step 5: Проверка в браузере (контроллер).** Максимальный зум, сиды `#1` и `#worldbox`:
  - наведение на морскую провинцию у берега — подсветка доходит до берега без ступенек;
  - наведение на сушу у берега — как после Task 3;
  - граница подсветки между двумя морскими и между двумя сухопутными провинциями — плавная, без клеток;
  - режим «Провинции» (M) — заливка с гладкими краями.
- [ ] **Step 6: Commit** `fix(render): гладкая заливка и подсветка у берега и между провинциями`, затем push.

### Task 7: Море — глубина вместо плоской заливки

**Files:**
- Modify: `src/render/mapShader.ts` (блок воды, около `:281-289`), `src/render/palette.ts`

**Interfaces:**
- Produces: в `MAP_COLORS` появляются `seaShallow`, `seaDeep`, `seaContour`.

- [ ] **Step 1:** Цвет воды зависит от глубины `−(height − SEA_LEVEL)`: плавный переход `seaShallow → seaDeep` по кривой, где половина перехода приходится на первые 25% глубины. Добавить две очень бледные изобаты на глубинах 0.06 и 0.18 ниже уровня моря: толщина 1px, непрозрачность 0.10, гаснут на дальнем зуме. Добавить бумажное зерно, как на суше, но слабее. Озёра (Task 4) без изобат.
- [ ] **Step 2:** `npm test`, lint, tsc чистые.
- [ ] **Step 3: Проверка в браузере (контроллер).** Скриншоты общего вида и среднего зума трёх сидов. Море читается как глубина, не неоново, без «ИИ-глянца». Цвета приглушённые, в той же гамме, что `seed-1-overview.jpg`.
- [ ] **Step 4: Commit** `feat(render): глубина моря и изобаты`, затем push.

### Task 8: Реки — сужение, берега, устья

**Files:**
- Modify: `src/render/riverLayer.ts`, `src/render/palette.ts`
- Test: `tests/render/riverLayer.test.ts`, `tests/sim/world/rivers.test.ts`

**Interfaces:**
- Produces: `riverWidthCells(width: number, t: number): number` — толщина в клетках мира. `t` — доля пути от истока, от 0 до 1. Толщина растёт от 0.35·w у истока до w у устья, где w = 0.3 + 0.22·width. Экранная толщина ограничена снизу 0.6 px, сверху не ограничена: на максимальном зуме река заметно шире. Цвет `MAP_COLORS.riverBank` — тёмная подложка шириной +40%.

- [ ] **Step 1: Тесты.**
  - `rivers end in water or join another river` (sim): для каждой реки medium сида `"1"` последняя точка — водная клетка или клетка другой реки. Сейчас это так по коду (`rivers.ts:142-176`), тест это закрепляет.
  - `riverWidthCells grows downstream`: монотонна по `t`, на `t=0` и `t=1` значения из Interfaces.
  - `mouth reaches coastline`: последняя отрисованная точка реки, впадающей в море, лежит не ближе 0.5 клетки к суше, чем береговая линия (по `coastSignedDistance` из Task 3; значение меньше −0.3).
- [ ] **Step 2:** Запустить и убедиться в FAIL.
- [ ] **Step 3:** Реализовать:
  - разбить каждую реку на участки, где ширина отличается не больше чем на 15%;
  - рисовать две обводки: сначала подложку `riverBank`, поверх воду;
  - у устья продлить последний отрезок на 1.5 клетки в сторону воды;
  - пересборку по корзинам зума оставить.
- [ ] **Step 4:** `npm test`, lint, tsc чистые.
- [ ] **Step 5: Проверка в браузере (контроллер).** На трёх сидах реки сужаются к истоку, видна тонкая тёмная кромка, ни одна река визуально не обрывается на суше у моря.
- [ ] **Step 6: Commit** `feat(render): реки с сужением, кромкой и устьями`, затем push.

### Task 9: Честный замер FPS

**Files:**
- Create: `src/render/frameBench.ts`
- Modify: `src/render/MapView.ts`, `src/ui/debugPanel.ts` (или как называется панель F3), `src/i18n/ru.ts`
- Test: `tests/render/frameBench.test.ts`

**Interfaces:**
- Produces:
  - `frameStats(samplesMs: number[]): { avg: number; p95: number; fps: number }`;
  - `MapView.benchmark(frames = 120): { avg: number; p95: number; fps: number }`: синхронно рендерит `frames` кадров через `app.renderer.render(app.stage)` и после каждого делает `gl.finish()`, считая время каждого кадра. От `requestAnimationFrame` не зависит.
  - кнопка «Замерить кадр» в панели F3 и строка результата «Кадр: N мс (p95 M мс) ≈ K к/с».

- [ ] **Step 1: Тест `frameStats`.** `[10,10,10,20]` даёт avg 12.5, p95 20, fps 80.
- [ ] **Step 2:** Запустить и убедиться в FAIL.
- [ ] **Step 3:** Реализовать функции и кнопку.
- [ ] **Step 4:** `npm test`, lint, tsc чистые.
- [ ] **Step 5: Проверка в браузере (контроллер).** Нажать кнопку на `#1` на общем виде и на максимальном зуме, записать числа в отчёт. Автору: открыть http://localhost:5173/#1 в своём Chrome, нажать F3, затем «Замерить кадр», и прислать число.
- [ ] **Step 6: Commit** `feat(ui): замер кадра в панели отладки`, затем push.

### Task 10: Задел под этап 2 — детерминизм и где живёт симуляция

Это ответ на главный вопрос отзыва: что существенно усложнит поселение, экономику, армии и онлайн. Код здесь маленький, основное — закрепить правила, пока игровой логики ещё нет.

**Files:**
- Create: `src/sim/world/worldHash.ts`, `src/game/README.md`
- Modify: `eslint.config.js`, `docs/architecture.md`, `docs/superpowers/specs/2026-11-16-settlement-strategy-design.md` (§7, пункт про детерминизм)
- Test: `tests/sim/world/worldHash.test.ts`, `tests/lint-rules.test.ts`

**Interfaces:**
- Produces:
  - `worldHash(world: World): string`: короткий хеш (как в `fingerprint.test.ts`) по `params`, `GEN_VERSION`, `height`, `biome`, `riverMask`, `provinceOf`. Нужен для проверки при входе в онлайн-игру, что у всех один мир.
  - Правило ESLint для `src/game/**`: всё из `src/sim/**`, плюс запрет `Math.pow`, `Math.exp`, `Math.log`, `Math.sin`, `Math.cos`, `Math.tan`, `Math.atan2`, `Math.hypot`, `Math.cbrt` и оператора `**` с дробной степенью. Сообщение: «в игровой логике только целые/фиксированная точка — см. docs/architecture.md».

- [ ] **Step 1: Тесты.**
  - `worldHash` стабилен для сида `"1"` small (зафиксировать значение);
  - `worldHash` меняется при смене сида;
  - lint: `Math.sin(1)` в `src/game/x.ts` даёт ошибку, в `src/render/x.ts` нет.
- [ ] **Step 2:** Запустить и убедиться в FAIL.
- [ ] **Step 3:** Реализовать. В `docs/architecture.md` добавить раздел «Готовность к этапу 2» с таблицей рисков (риск → что решено → когда делать):
  - **Детерминизм между браузерами.** Генерация мира использует дробную математику, а на разных движках `Math.sin` и подобные могут давать разные биты. Решение: при входе в онлайн сравнивать `worldHash`; если не совпал, мир присылает хост (снимок около 4–8 МБ сжатый). Игровая логика (`src/game`) с первого дня работает в целых или фиксированной точке, это закреплено линтером. Делать: правило сейчас, синхронизацию на этапе онлайна.
  - **Где живёт симуляция.** Сейчас воркер генерирует мир и **отдаёт** его главному потоку, а сам ничего не хранит. Решение на этап 2: воркер генерации становится воркером симуляции, хранит `World` и состояние игры и шлёт отрисовке снимки и изменения. Главный поток держит только копию `provinceOf` для наведения. Делать: в начале этапа 2.
  - **Время.** Фиксированный тик «день». Скорость меняет число тиков в секунду, а не длину тика. Команды игрока ставятся на номер тика.
  - **Сохранения.** Сохранение хранит `GEN_VERSION`. Если версия не совпадает, берётся сохранённый снимок мира, а не перегенерация.
  - **Армии и пути.** Граф `adjacency` с `length`, `river` и `strait` уже есть. Нужны расстояния между центрами провинций и тип воды (Task 4), чтобы флот не попадал в озёра.
  - **Экономика.** Данные провинции (биом, прибрежность, реки) есть. Ресурсы и население — это новые поля состояния игры, а не мира.

  В спеке §7 «Детерминизм» добавить одну фразу про целые числа в игровой логике и сверку `worldHash`.
- [ ] **Step 4:** `npm test`, lint, tsc чистые.
- [ ] **Step 5: Commit** `feat: worldHash, правило целочисленной игровой логики, риски этапа 2`, затем push.

### Task 11: Дешёвые мелочи из отложенных

**Files:** указаны в каждом пункте.

- [ ] **Step 1:** Каждый пункт сделать с тестом там, где он применим:
  1. `src/render/provinceData.ts`: `set` бросает `RangeError`, если канал не целое число от 0 до 255. Тест.
  2. `src/render/MapView.ts`: `updateRegion` обрезает прямоугольник по границам карты. `setProvinceData` сам ставит бит FILL, если RGB не нулевой. Обновить JSDoc.
  3. `src/worker/genWorker.ts`: если `generateWorld` бросил исключение после старта запекания поверхности, задача запекания отменяется и вложенный воркер завершается.
  4. URL-параметры: значения `off=` декодируются через `decodeURIComponent`; `packs=` с пустым списком переживает цикл `build → parse`. Тесты в существующем тесте URL.
  5. `src/sim/rng.ts`: `int(min, maxExcl)` бросает ошибку, если аргументы не целые или `maxExcl <= min`. Тест.
  6. `package.json`: `pixi.js` перенести из `devDependencies` в `dependencies`.
  7. Тесты: убрать `console.log` из тестов (EDT и прочие), вывод `npm test` без лишних строк.
  8. `tests/lint-rules.test.ts`: тесты на запрет DOM-глобалов и подпутей `pixi.js/*` в `src/sim`.
  9. Сообщение об ошибке очистки провинций (`provinceCleanup.ts:154`) по-русски через ключ `ru.ts` в слое ui. В sim остаётся код ошибки.
- [ ] **Step 2:** `npm test`, lint, tsc чистые.
- [ ] **Step 3: Commit** `chore: мелкие доработки по итогам этапа 1`, затем push.

### Task 12: Итоговая проверка в браузере и отчёт

- [ ] **Step 1:** Контроллер: сиды `#1`, `#worldbox`, `#Бета-7?fantasy=1`, `#1?size=small`, `#1?size=large`. Общий вид, средний зум, максимальный зум у берега, режим «Провинции», F3 с замером кадра. Ошибок в консоли нет.
- [ ] **Step 2:** Скриншоты в `docs/screenshots/stage-1-5/`, рядом `docs/screenshots/stage-1-5/README.md` с подписями «было/стало» для берега, озёр, моря и рек.
- [ ] **Step 3:** Дописать в `docs/superpowers/stage-1-decisions.md` решения этого плана.
- [ ] **Step 4: Commit** `docs: скриншоты и решения этапа 1.5`, затем push.
