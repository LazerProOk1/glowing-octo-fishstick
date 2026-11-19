# Commit rules (Conventional Commits)

Format: `type(scope): описание`. Type and scope in English; everything after the colon
(description and body) in Russian. Short description, lowercase, no trailing period.
Example: `fix(render): берег без лесенки у подсветки`.
Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

Types: `feat` new capability · `fix` bug fix · `refactor` no behaviour change (world fingerprints unchanged) ·
`perf` faster, same result · `test` tests only · `docs` · `style` formatting only ·
`build` Vite/deps · `ci` · `chore` (.gitignore, configs) · `revert`.

Scopes: `sim`, `render`, `ui`, `worker`, `content`, `i18n`, `assets`, `tools`, `deps`.
Omit the scope if a change spans several.

Body (optional, Russian): what and why. If generation output changes (GEN_VERSION bumped) or
compatibility breaks (save format, worker protocol), add `BREAKING CHANGE: …` in Russian.

Commit only your own files by path (`git commit <paths>`), never `git add -A` when other agents work.
