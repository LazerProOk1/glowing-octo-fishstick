import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

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
      'no-restricted-imports': [
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
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Используйте детерминированный ГСЧ.' },
        { object: 'performance', property: 'now', message: 'Время в sim запрещено.' },
      ],
      'no-restricted-globals': [
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
      ],
    },
  },
);
