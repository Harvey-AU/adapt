# AGENTS.md

This file is the compact instruction source for OpenAI Codex and OpenCode when project instructions are loaded.

## Hard rules

- Australian English in outputs, docs, comments, and generated text.
- Preserve existing behaviour unless explicitly requested to change it.
- Ask one focused confirmation question only when correctness or safety is blocked.
- Never expose or invent secrets, credentials, JWTs, or end-user private data.
- For destructive actions, state the risk before execution.

## Execution defaults

- Use bounded, incremental edits.
- Prefer gofmt/goimports + target checks on Go files.
- Keep commit messages short (about five to six words), no AI attribution.

## Automated review gates

- Treat `scripts/security-check.sh` and Coderabbit as mandatory pre-merge checks.
- Do not request or attempt bypasses unless explicitly approved by maintainers.
- Before risky edits, call out likely gate failures and mitigation.

## Agent routing matrix

- Planning ambiguity, architecture changes, or large-scope tasks -> `planner` skill.
- Behavioural correctness review, code quality, and regression checks -> `code-reviewer` skill.
- Security-sensitive/destructive actions (secrets, auth, schema/data-impacting changes) -> `security-auditor` skill.
- If multiple conditions match, choose `security-auditor`, then `code-reviewer`, then `planner`.

## Source-of-truth docs

- `README.md`
- `CHANGELOG.md`
- `SECURITY.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/DATABASE.md`
- `docs/architecture/API.md`
- `docs/development/DEVELOPMENT.md`
- `docs/TEST_PLAN.md`

## OpenCode behavior (2026-02-22)

- OpenCode reads `AGENTS.md` from the current project root path chain.
- If none exists, it can fall back to Claude-compatible `CLAUDE.md` conventions.
- Keep this file short because OpenCode consumes it directly for startup context.

## Codex behavior (2026-02-22)

- Codex builds instruction order from global then project `AGENTS.md` files, with overrides where configured.
- Only a limited combined size is loaded; keep critical guidance near the top.
- Use short files and split by directory only when scope-specific rules are required.

## Skills location (tool-native)

- OpenCode: `.opencode/skills/<skill-name>/SKILL.md`
- Codex: `.agents/skills/<skill-name>/SKILL.md`

Keep this file as the first fallback, and use skills only for high-leverage workflows.
