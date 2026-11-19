import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Правила детерминированного ядра (src/sim) — их же наследует игровая логика (src/game).
const coreImports = [
  'error',
  {
    patterns: [
      { group: ['pixi.js', 'pixi.js/*'], message: 'sim не должен зависеть от pixi.js' },
      { group: ['**/render', '**/render/**', '**/ui', '**/ui/**'], message: 'sim не должен импортировать render/ui' },
      {
        group: ['**/worker', '**/worker/**', '**/i18n', '**/i18n/**', '**/main', '**/main.ts'],
        message: 'sim не должен импортировать worker, i18n и main',
      },
    ],
  },
];

const coreProperties = [
  { object: 'Math', property: 'random', message: 'Используйте детерминированный ГСЧ.' },
  { object: 'performance', property: 'now', message: 'Время в sim запрещено.' },
];

const coreGlobals = [
  'error',
  { name: 'Date', message: 'Время в sim запрещено.' },
  { name: 'performance', message: 'Время в sim запрещено.' },
  { name: 'document', message: 'DOM в sim запрещён.' },
  { name: 'window', message: 'DOM в sim запрещён.' },
  { name: 'localStorage', message: 'DOM в sim запрещён.' },
  { name: 'crypto', message: 'Источник случайности в sim запрещён: используйте детерминированный ГСЧ.' },
  { name: 'self', message: 'Контекст воркера в sim запрещён.' },
  { name: 'setTimeout', message: 'Таймеры в sim запрещены.' },
  { name: 'fetch', message: 'Сеть в sim запрещена.' },
];

// Игровая логика: дробная математика движка даёт разные биты в разных браузерах — онлайн разъедется.
const INT_ONLY = 'в игровой логике только целые/фиксированная точка — см. docs/architecture.md';
const FLOAT_MATH = ['pow', 'exp', 'log', 'sin', 'cos', 'tan', 'atan2', 'hypot', 'cbrt'];
// `**` разрешён только с целой степенью-литералом (2 ** 3); дробная или переменная степень запрещена.
const INT_EXPONENT = '[right.type="Literal"][right.raw=/^[0-9]+$/]';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.superpowers'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    // Детерминированное ядро симуляции: без рендера, UI, DOM, времени и случайности.
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': coreImports,
      'no-restricted-properties': ['error', ...coreProperties],
      'no-restricted-globals': coreGlobals,
    },
  },
  {
    // Игровая логика этапа 2+: всё из src/sim плюс только целая/фиксированная арифметика.
    files: ['src/game/**/*.ts'],
    rules: {
      'no-restricted-imports': coreImports,
      'no-restricted-properties': [
        'error',
        ...coreProperties,
        ...FLOAT_MATH.map((property) => ({ object: 'Math', property, message: INT_ONLY })),
      ],
      'no-restricted-globals': coreGlobals,
      'no-restricted-syntax': [
        'error',
        { selector: `BinaryExpression[operator="**"]:not(${INT_EXPONENT})`, message: INT_ONLY },
        { selector: `AssignmentExpression[operator="**="]:not(${INT_EXPONENT})`, message: INT_ONLY },
      ],
    },
  },
);
