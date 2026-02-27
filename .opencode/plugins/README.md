# OpenCode plugins

Project-local OpenCode plugins live in this directory.

- Add JavaScript or TypeScript plugin files here.
- Keep sensitive values in environment variables, not in plugin source.
- If a plugin needs external dependencies, add them to `.opencode/package.json`.
- `env-protection.js` blocks reads of likely secret files by default.
- Set `OPENCODE_ALLOW_SECRET_READ=true` only for short-lived, explicit
  overrides.
- `automation-hooks.js` adds project automation for formatting, prompt context,
  routing hints, and session-idle test runs.
- Set `OPENCODE_AUTO_TEST_ON_IDLE=false` to disable automatic idle test runs.

OpenCode auto-loads files from `.opencode/plugins/` when the project starts.
