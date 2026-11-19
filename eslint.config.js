import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Правила детерминированного ядра (src/sim) — их же наследует игровая логика (src/game).
const coreImports = [
  'error',
  {
    patterns: [
      { group: ['pixi.js', 'pixi.js/*'], message: 'Детерминированный код не зависит от pixi.js.' },
      { group: ['**/render', '**/render/**', '**/ui', '**/ui/**'], message: 'Детерминированный код не импортирует render и ui.' },
      {
        group: ['**/worker', '**/worker/**', '**/i18n', '**/i18n/**', '**/main', '**/main.ts'],
        message: 'Детерминированный код не импортирует worker, i18n и main.',
      },
    ],
  },
];

const coreProperties = [
  { object: 'Math', property: 'random', message: 'Используйте детерминированный ГСЧ.' },
  { object: 'performance', property: 'now', message: 'Реальное время здесь запрещено.' },
];

const coreGlobals = [
  'error',
  { name: 'Date', message: 'Реальное время здесь запрещено.' },
  { name: 'performance', message: 'Реальное время здесь запрещено.' },
  { name: 'document', message: 'DOM здесь запрещён.' },
  { name: 'window', message: 'DOM здесь запрещён.' },
  { name: 'localStorage', message: 'DOM здесь запрещён.' },
  { name: 'crypto', message: 'Источник случайности здесь запрещён: используйте детерминированный ГСЧ.' },
  { name: 'self', message: 'Контекст воркера здесь запрещён.' },
  { name: 'setTimeout', message: 'Таймеры здесь запрещены.' },
  { name: 'fetch', message: 'Сеть здесь запрещена.' },
];

// Игровая логика: функции Math, которые движок считает приближённо, в разных браузерах могут дать
// разные последние биты — онлайн-партия разъедется. IEEE 754 требует точного округления для + − × ÷
// и sqrt, поэтому они дают одинаковые биты везде и разрешены (Math.sqrt не в списке намеренно).
const INT_ONLY = 'в игровой логике только целые/фиксированная точка — см. docs/architecture.md';
const FLOAT_MATH = [
  'pow', 'exp', 'expm1', 'log', 'log2', 'log10', 'log1p', 'cbrt', 'hypot',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
];
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
    // Игровая логика этапа 2+: всё из src/sim плюс запрет приближённых функций Math.
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
