# glowing-octo-fishstick

Браузерная стратегия про развитие поселения (TypeScript + PixiJS). Подробный дизайн: [docs/superpowers/specs/2026-11-16-settlement-strategy-design.md](docs/superpowers/specs/2026-11-16-settlement-strategy-design.md).

## Запуск

```
npm install
npm run dev     # dev-сервер Vite
npm test        # тесты (vitest)
npm run lint    # ESLint
npm run build   # проверка типов и сборка
```

Код в `src/sim/**` детерминирован и не зависит от рендера, UI и DOM (см. правила в `eslint.config.js`).
