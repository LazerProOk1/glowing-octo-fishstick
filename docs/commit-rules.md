# Commit rules (Conventional Commits)

Format: `type(scope): описание`. Type and scope in English; the title description (after the colon)
in Russian — short, lowercase, no trailing period. The body (optional) in English.
Example: `fix(render): берег без лесенки у подсветки`.

Co-author trailer: name the model that actually made the commit, never copy someone else's.
E.g. `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`,
`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`,
`Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`; a non-Claude tool (OpenCode, LM Arena, Codex…)
writes its own model and tool name, e.g. `Co-Authored-By: DeepSeek V4.1 Flash via OpenCode`.
If unsure which model you are, omit the trailer rather than guess.

Types: `feat` new capability · `fix` bug fix · `refactor` no behaviour change (world fingerprints unchanged) ·
`perf` faster, same result · `test` tests only · `docs` · `style` formatting only ·
`build` Vite/deps · `ci` · `chore` (.gitignore, configs) · `revert`.

Scopes: `sim`, `render`, `ui`, `worker`, `content`, `i18n`, `assets`, `tools`, `deps`.
Omit the scope if a change spans several.

Body (optional, English): what and why. If generation output changes (GEN_VERSION bumped) or
compatibility breaks (save format, worker protocol), add `BREAKING CHANGE: …` in English.

Commit only your own files by path (`git commit <paths>`), never `git add -A` when other agents work.
