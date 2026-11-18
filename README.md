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

## Адрес мира

`#<сид>?fantasy=1&off=swamp,desert` — сид (можно кириллицей), фэнтези-биомы и выключенные биомы. Например, `#Бета-7?fantasy=1`.

## Моддинг

Биомы — данные, а не код: [docs/modding/biomes.md](docs/modding/biomes.md) (как добавить биом, включить или выключить его, сделать свой пак).
