# Шаг 1 — каркас проекта и генерация карты

Документ фиксирует структуру файлов, типы и спорные решения до написания кода.

## 1. Структура файлов

```
.
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── components.json                 # конфиг shadcn/ui
├── .gitignore
└── src/
    ├── main.tsx                    # bootstrap React
    ├── App.tsx                     # layout: TopBar + MapCanvas
    ├── index.css                   # @tailwind + CSS-переменные темы
    ├── vite-env.d.ts
    ├── types/
    │   ├── world.ts                # Biome, ResourceType, Tile, World
    │   └── viewport.ts             # Viewport (pan/zoom)
    ├── simulation/
    │   ├── noise.ts                # seeded 2D simplex noise (без зависимостей)
    │   └── mapGenerator.ts         # generateWorld(seed, width, height)
    ├── rendering/
    │   ├── palette.ts              # цвета биомов + цвет ресурса
    │   └── MapRenderer.ts          # Canvas 2D: offscreen tiles, pan, zoom
    ├── store/
    │   └── worldStore.ts           # Zustand: world, seed, actions
    ├── components/
    │   ├── TopBar.tsx              # кнопка «Новый мир» + ползунок seed
    │   ├── MapCanvas.tsx           # <canvas>, инициализация MapRenderer
    │   └── ui/
    │       ├── button.tsx          # shadcn/ui Button
    │       └── slider.tsx          # shadcn/ui Slider
    └── lib/
        └── utils.ts                # cn() для shadcn
```

## 2. Типы — `src/types/world.ts`

```ts
export type Biome =
  | 'ocean'
  | 'coast'
  | 'plains'
  | 'forest'
  | 'mountains'
  | 'desert'
  | 'tundra'
  | 'swamp'
  | 'volcanic';

export type ResourceType =
  | 'none'
  | 'wood'
  | 'stone'
  | 'iron'
  | 'gold'
  | 'fish'
  | 'grain';

export interface Tile {
  /** 0..100 */
  elevation: number;
  /** 0..100 */
  moisture: number;
  /** -30..40, °C */
  temperature: number;
  /** 0..100 */
  fertility: number;
  biome: Biome;
  resource: ResourceType;
  ownerId: string | null;
}

export interface World {
  width: number;
  height: number;
  seed: number;
  tiles: Tile[][];
  tick: number;
}
```

`src/types/viewport.ts`

```ts
export interface Viewport {
  /** смещение в пикселях canvas */
  offsetX: number;
  offsetY: number;
  /** 1 = 4 px на тайл */
  zoom: number;
}
```

Правила типизации: `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitAny` — `any` запрещён, для шумовых карт `Float32Array`.

## 3. Биомы: таблица и порядок проверки

Из ТЗ таблица частично перекрывается (forest/plains по moisture, tundra внутри mountains),
поэтому порядок проверок фиксирован сверху вниз:

| # | Условие | Биом |
|---|---------|------|
| 1 | `elev >= 88` и редкий пик (`ridge noise > 0.93`) | volcanic |
| 2 | `elev < 20` | ocean |
| 3 | `elev < 25` | coast |
| 4 | `elev >= 75` и `temp < 0` | tundra |
| 5 | `elev >= 50` | mountains |
| 6 | `elev 25..50`, `moist >= 70`, `elev < 35`, `temp >= 5` | swamp |
| 7 | `elev 25..50`, `moist > 60` | forest |
| 8 | `elev 25..50`, `moist < 25` | desert |
| 9 | `elev 25..50`, `temp < 0` | tundra |
| 10 | иначе | plains |

Открытые вопросы (см. вопросы в чате): swamp-условие, набор `ResourceType`.

Fertility: база по биому (forest 80, plains 70, swamp 60, coast 45, desert 15, mountains 10,
tundra 8, volcanic 5, ocean 0) × поправка на moisture, ограничение 0..100.
Resource: редкость по биому (wood в forest, stone/iron в mountains, fish в coast/ocean,
grain в plains, gold в volcanic), проверяется детерминированным хешем `(x, y, seed)`.

## 4. Генератор — `src/simulation/mapGenerator.ts`

- `noise.ts`: собственная реализация 2D simplex noise с seed (permutation table из
  mulberry32) — без внешних зависимостей, воспроизводимость по seed.
- elevation: 4 октавы FBM (`freq 0.012`, `lacunarity 2`, `gain 0.5`) + радиальный спад к краям
  (чтобы получился континент, а не шумовая каша у рамки).
- moisture: 3 октавы FBM, `freq 0.02`, независимый seed-сдвиг.
- temperature: широтный градиент (`y / height`), минус высота (`-elev * 0.15`), ± шум 2 °C.
- Все значения нормализуются в 0..100; `generateWorld(seed, width = 150, height = 100)`.

## 5. Рендерер — `src/rendering/MapRenderer.ts`

- Класс `MapRenderer(canvas)`, методы `setWorld(world)`, `render()`, `destroy()`.
- Мир рисуется один раз в offscreen `ImageData` (150×100, 1 тайл = 1 px), затем
  масштабируется на canvas с `imageSmoothingEnabled = false` → тайл 4×4 px при zoom 1
  и резкие пиксели при увеличении.
- Pan: pointer down/move/up (pointer capture), левая кнопка.
- Zoom: `wheel`, масштаб вокруг курсора, clamp `0.5..12`, `deltaY` → экспонента.
- `devicePixelRatio` учитывается; при `ResizeObserver` — перерисовка.
- Viewport живёт в экземпляре рендерера (не в Zustand) — pan/zoom не вызывает ререндер React.
- Палитра строго из ТЗ: ocean `#4A90B8`, coast `#C2B280`, plains `#8FBC6B`, forest `#4A7C3F`,
  mountains `#8B8680`, desert `#D4B87A`, tundra `#C8D8E0`, swamp `#6B7F5A`, volcanic `#5C4033`.

## 6. UI

- `TopBar`: высота 48 px, `border-b border-[#E5E7EB]`, фон `#FFFFFF`; слева — заголовок
  «Карта мира», справа — «Seed: N», ползунок 1..99999, кнопка «Новый мир» (`#2563EB`).
- `MapCanvas`: `bg-[#F9FAFB]`, canvas на всю область, `cursor-grab` / `cursor-grabbing`.
- Никаких лоадеров, анимаций, лишних экранов.

## 7. Зависимости

`react@18`, `react-dom@18`, `zustand`, `lucide-react`, `tailwindcss@3.4`, `postcss`,
`autoprefixer`, `class-variance-authority`, `clsx`, `tailwind-merge`,
`@radix-ui/react-slider`, `@types/*`, `vite`, `typescript`.

## 8. Коммиты шага

1. `chore: init vite react typescript project` (каркас, конфиги, tailwind)
2. `feat: add world types and simplex noise generator`
3. `feat: add canvas map renderer with pan and zoom`
4. `feat: add top bar with seed control and new world action`

Каждый коммит пушится в `arena/e6f76c29-glowing-octo-fishstick`.

## 9. Что реализовано и отличия от плана

- `tsconfig.node.json` не понадобился: `vite.config.ts` и `tailwind.config.ts` включены
  в основной `tsconfig.json` (`types: ["node"]`).
- Вместо простой нормализации 0..100 используется квантильное отображение шумового поля
  на целевую функцию распределения (`ELEVATION_STOPS`, `MOISTURE_STOPS`) — доли воды и
  климатических зон стабильны для любого сида, форма карты остаётся шумовой.
- Добавлено искажение береговой линии отдельным low-frequency шумом (`COASTLINE_FBM`).
- Ползунок сида обновляет подпись сразу, мир пересобирается на `onValueCommit`
  (генерация 150×100 ≈ 25–40 мс, на каждое движение мыши это лишняя нагрузка).
- Финансовая часть ресурсов (добыча/экономика) не реализована — только детерминированное
  распределение `ResourceType` по биому.
