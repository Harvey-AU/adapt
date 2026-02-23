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

## Project-specific rules

**Auth redirect contract:** OAuth redirects are centralised in `web/static/js/auth.js` (`handleSocialLogin`). Deep-link URLs must return to the exact originating URL. Invite acceptance routes to `/welcome`.

**Dockerfile triple-surface rule:** Every new top-level HTML page requires three changes — HTTP route in `internal/api/handlers.go`, the page file on disk, and a `COPY` line in `Dockerfile`. Missing the Dockerfile copy causes a runtime 404.

**Database migrations:** Use `supabase migration new <name>`. Never edit or rename deployed migrations. Keep migrations additive.

## Automated review gates

- Treat `scripts/security-check.sh` and Coderabbit as mandatory pre-merge checks.
- Do not request or attempt bypasses unless explicitly approved by maintainers.
- Before risky edits, call out likely gate failures and mitigation.

## Source-of-truth docs

- `README.md`
- `CHANGELOG.md`
- `SECURITY.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/DATABASE.md`
- `docs/architecture/API.md`
- `docs/development/DEVELOPMENT.md`
- `docs/TEST_PLAN.md`

## Skills location (tool-native)

- OpenCode: `.opencode/skills/<skill-name>/SKILL.md`
- Codex: `.agents/skills/<skill-name>/SKILL.md`
- Claude-compatible skill fallback: `.claude/skills/<skill-name>/SKILL.md`

Available review skill in this repo:

- `coderabbit-review` (single-comment workflow with one commit per resolved comment, `.md` skip unless requested, PR-thread acknowledgement for skipped items).

Keep this file as the first fallback, and use skills only for high-leverage workflows.
