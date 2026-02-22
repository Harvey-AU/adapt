# CLAUDE.md

Last reviewed: 2026-02-22

This file is the project operating guide for Claude Code (desktop/CLI) in this repository.

## Hard requirements

- Use Australian English in code comments, commit messages, user-facing text, and generated docs.
- Preserve existing behaviour unless explicitly asked to change it.
- Ask at most one clarifying question when ambiguity materially affects correctness or safety.
- Ask for explicit confirmation before destructive steps (schema changes, credentials/config changes, or data-impacting actions).
- Do not expose, invent, or log secrets, credentials, JWTs, or end-user content.
- Keep edits scoped and incremental.
- If a safety limit is reached in a tool, pause and continue with the best available path.

## Technical baseline

- Language stack: Go 1.26 backend, Vue-free frontend, Supabase-backed data.
- Run formatting (`gofmt`, `goimports`) on touched Go files.
- Prefer `go test` and targeted checks before broader validation.
- Keep commit messages short and descriptive (five to six words).

## Instruction loading (how this repo should be read by Claude Code)

- `CLAUDE.md` (this file) and optional `CLAUDE.local.md` are read in the project scope.
- Agent role files are loaded from `.claude/agents/*.md` and use YAML frontmatter.
- Project agent files should be named and structured as `name`, `description`, and optional `tools`/`model`.

## Claude subagents required in this repo

Use these files as dedicated specialists to reduce context pollution:

- `.claude/agents/planner.md`
- `.claude/agents/code-reviewer.md`
- `.claude/agents/security-auditor.md`

Coderabbit review support:

- Open a companion review workflow from `.claude/skills/coderabbit-review/SKILL.md` (used by compatible tool modes).

## Work approach

- For small tasks: do minimal read/plan/implement.
- For large changes: confirm scope, prepare a staged plan, then implement in bounded increments.
- Report blockers clearly with concrete risk and proposed mitigation.

## Automated review gates

- Treat `scripts/security-check.sh` and Coderabbit checks as mandatory pre-merge gates.
- Do not recommend or request bypasses unless explicitly approved by project maintainers.
- If a change risks failing pre-commit/security checks, call it out before implementation.

## Agent routing matrix

- Planning ambiguity, architecture changes, large scope, or new feature decomposition -> `planner`
- Behavioural correctness review, refactoring quality check, or release-readiness review -> `code-reviewer`
- Destructive operations, credential/security-sensitive flows, auth, secrets, PII, or schema/data-impacting change -> `security-auditor`
- If multiple roles match, prefer `security-auditor` over `code-reviewer`, then `planner`.

## Source-of-truth docs

For detailed, authoritative rules and onboarding:

- `README.md`
- `CHANGELOG.md`
- `SECURITY.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/DATABASE.md`
- `docs/architecture/API.md`
- `docs/development/DEVELOPMENT.md`
- `docs/BRANCHING.md` (or equivalent repo workflow doc)
- `docs/TEST_PLAN.md` (or equivalent)

## Cross-tool consistency rule

- Keep this file and root `AGENTS.md` aligned on high-level constraints.
- Keep repeated constraints short to avoid context overload in Codex/OpenCode.
