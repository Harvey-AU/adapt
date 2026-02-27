# OpenCode Desktop setup

This project includes a checked-in `opencode.json` so OpenCode Desktop App can
pick up project defaults for instructions, MCP servers, LSP servers, and
plugins.

## Files

- `opencode.json` - project-level OpenCode config loaded by CLI/Desktop.
- `.opencode/agents/` - project-local specialist agents.
- `.opencode/commands/` - optional project-local command files.
- `.opencode/plugins/` - project-local plugin directory.

## Current defaults

- **Instructions**: loads `AGENTS.md`, `CLAUDE.md`, and `SECURITY.md`.
- **LSP**: keeps `gopls`, `bash`, `yaml-ls`, `typescript`, and `eslint`
  explicitly configured.
- **MCP**: includes optional `context7` and `sentry` entries, disabled by
  default.
- **Serena MCP**: includes an optional local `serena` entry, disabled by
  default.
- **Plugins**: starts with an empty npm plugin list (`"plugin": []`).
- **Agents**: includes `planner`, `code-reviewer`, and `security-auditor`.
- **Commands**: includes `security-check`, `monitor-fly`, and `load-test`.
- **Permissions**: auto-allows trusted low-risk commands and asks for everything
  else.

## Enable MCP servers

1. Open `opencode.json`.
2. Set the server `enabled` field to `true`.
3. For Serena, confirm the local command works on your machine (default is
   `uvx --from serena-agent serena start-mcp-server --transport stdio --project .`
   and adjust `mcp.serena.command` if needed.
4. For Context7, set `CONTEXT7_API_KEY` in your environment if you need higher
   limits.
5. For Sentry, run `opencode mcp auth sentry` to complete OAuth.

## Add plugins

- **Local plugin**: add `.js` or `.ts` files under `.opencode/plugins/`.
- **npm plugin**: add package names to the `plugin` array in `opencode.json`.
- **Secret guard**: this project includes `.opencode/plugins/env-protection.js`
  to block reads of likely secret files by default.
- **Automation hooks**: this project includes
  `.opencode/plugins/automation-hooks.js` to:
  - auto-format files after edits (`prettier`, `eslint --fix`, `gofmt`)
  - inject repo context on first prompt in each session
  - add lightweight routing hints for planner/reviewer/security prompts
  - run automatic tests when the session goes idle

## Use project commands

Run these from OpenCode as slash commands:

- `/security-check` - run mandatory security gates and summarise failures.
- `/monitor-fly [args]` - run Fly log monitoring with optional arguments.
- `/load-test [args]` - run scripted load testing safely.

## Use specialist agents

- `planner` - scoped planning before implementation.
- `code-reviewer` - diff-first review for regressions and coverage.
- `security-auditor` - security and permissions-focused review.

## Optional environment toggles

- `OPENCODE_ALLOW_SECRET_READ=true` - temporarily bypass plugin secret-read
  blocking.
- `OPENCODE_AUTO_TEST_ON_IDLE=false` - disable automatic test runs when the
  session idles.

Keep API keys and secrets out of source control; use environment variables or
separate secret files referenced by OpenCode config substitutions.
