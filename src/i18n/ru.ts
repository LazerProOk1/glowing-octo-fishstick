/** Все строки интерфейса. В src/ui/*.ts кириллицы в литералах быть не должно — только t(ключ). */
export const ru = {
  'app.title': 'Стратегия поселения',

  'loading.title': 'Генерация мира',
  'loading.seed': 'Сид',

  'stage.height': 'Рельеф…',
  'stage.climate': 'Климат…',
  'stage.biomes': 'Биомы…',
  'stage.shoreline': 'Береговая линия…',
  'stage.rivers': 'Реки…',
  'stage.provinces': 'Провинции…',
  'stage.bake': 'Текстуры карты…',

  'stageShort.height': 'Рельеф',
  'stageShort.climate': 'Климат',
  'stageShort.biomes': 'Биомы',
  'stageShort.shoreline': 'Береговая линия',
  'stageShort.rivers': 'Реки',
  'stageShort.provinces': 'Провинции',
  'stageShort.bake': 'Текстуры карты',

  'tip.province': 'Провинция',
  'tip.land': 'суша',
  'tip.sea': 'море',
  'tip.water': 'вода',
  'tip.coastal': 'прибрежная',

  'debug.title': 'Отладка',
  'debug.hint': 'F3',
  'debug.seed': 'Сид',
  'debug.fps': 'FPS',
  'debug.frame': 'Кадр',
  'debug.bench': 'Замерить кадр',
  'debug.benchRunning': 'замер…',
  'debug.benchUnavailable': 'недоступно',
  'debug.benchResult': '{avg} мс (p95 {p95} мс) ≈ {fps} к/с',
  'debug.provinces': 'Провинции',
  'debug.land': 'суша',
  'debug.sea': 'море',
  'debug.timings': 'Генерация, мс',
  'debug.total': 'Всего',
  'debug.surface': 'Рельеф, паралл.',
  'debug.newSeed': 'Новый сид',
  'debug.placeholder': 'сид, Enter',
  'debug.mapMode': 'Режим карты',
  'debug.keys': 'Клавиши',

  'key.debug': 'Панель отладки',
  'key.mapMode': 'Следующий режим карты',

  'mapMode.terrain': 'Рельеф',
  'mapMode.provinces': 'Провинции',

  'unit.s': 'с',

  'error.title': 'Ошибка',
  'error.init': 'Не удалось запустить графику.',
  'error.webgl2': 'Браузер не поддерживает WebGL 2. Обновите браузер или включите аппаратное ускорение.',
  'error.generation': 'Не удалось сгенерировать мир.',
  'error.cleanupNoConverge': 'Не удалось собрать провинции из-за сложного рельефа. Попробуйте другой сид.',
  'error.retry': 'Перезагрузить',

  'seed.words': 'Альфа,Бета,Гамма,Дельта,Эпсилон,Дзета,Эта,Тета,Йота,Каппа,Лямбда,Сигма,Омега',

  // Контент: в данных паков названия — ключи (`nameKey`), перевод — здесь. Другой язык —
  // файл с теми же ключами (en.ts); переводы внешних паков подмешиваются к этой таблице.
  'pack.base': 'Базовый',

  'biome.ocean': 'океан',
  'biome.coast': 'побережье',
  'biome.lake': 'озеро',
  'biome.plains': 'равнины',
  'biome.forest': 'лес',
  'biome.taiga': 'тайга',
  'biome.tundra': 'тундра',
  'biome.glacier': 'ледник',
  'biome.desert': 'пустыня',
  'biome.steppe': 'степь',
  'biome.swamp': 'болото',
  'biome.hills': 'холмы',
  'biome.mountains': 'горы',
  'biome.jungle': 'джунгли',
  'biome.mushroom_forest': 'грибной лес',
  'biome.magic_forest': 'магический лес',
  'biome.ash_wastes': 'пепельные пустоши',
  'biome.crystal_mountains': 'кристальные горы',
} as const satisfies Record<string, string>;

export type RuKey = keyof typeof ru;

export function t(key: RuKey): string {
  return ru[key];
}

/**
 * Перевод ключа, известного только во время выполнения (названия контента из паков).
 * Нет перевода — возвращается сам ключ: видно, чего не хватает, и интерфейс не падает.
 */
export function translate(key: string): string {
  return Object.hasOwn(ru, key) ? ru[key as RuKey] : key;
}
