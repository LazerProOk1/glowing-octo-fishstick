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
  'tip.coastal': 'прибрежная',

  'debug.title': 'Отладка',
  'debug.hint': 'F3',
  'debug.seed': 'Сид',
  'debug.fps': 'FPS',
  'debug.provinces': 'Провинции',
  'debug.land': 'суша',
  'debug.sea': 'море',
  'debug.timings': 'Генерация, мс',
  'debug.total': 'Всего',
  'debug.surface': 'Рельеф, паралл.',
  'debug.newSeed': 'Новый сид',
  'debug.placeholder': 'сид, Enter',

  'unit.s': 'с',

  'error.title': 'Ошибка',
  'error.init': 'Не удалось запустить графику.',
  'error.webgl2': 'Браузер не поддерживает WebGL 2. Обновите браузер или включите аппаратное ускорение.',
  'error.generation': 'Не удалось сгенерировать мир.',
  'error.retry': 'Перезагрузить',

  'seed.words': 'Альфа,Бета,Гамма,Дельта,Эпсилон,Дзета,Эта,Тета,Йота,Каппа,Лямбда,Сигма,Омега',
} as const satisfies Record<string, string>;

export type RuKey = keyof typeof ru;

export function t(key: RuKey): string {
  return ru[key];
}
