# Modern JavaScript Opportunities (Frontend Scan)

Date: 2026-02-27 Scope: `web/static/js/*.js`

This is a low-risk shortlist of modern JavaScript upgrades that could improve
readability, error diagnostics, and maintainability without changing product
behaviour.

## Recommended quick wins (5-10 targeted spots)

1. `Array.prototype.at()` for last segment lookup
   - File: `web/static/js/job-page.js:1714`
   - Current: `pathSegments[pathSegments.length - 1]`
   - Suggested: `pathSegments.at(-1)`
   - Why: clearer intent, fewer off-by-one mistakes.

2. `Object.hasOwn()` for form key collection robustness
   - File: `web/static/js/bb-data-binder.js:437`
   - Current: `if (data[key]) { ... }`
   - Suggested: `if (Object.hasOwn(data, key)) { ... }`
   - Why: avoids edge cases with falsy values (for example empty string or `0`).

3. `Error.cause` when wrapping config-load errors
   - File: `web/static/js/core.js:67`
   - Current: `throw new Error("Failed to load /config.js: " + error.message);`
   - Suggested:
     `throw new Error("Failed to load /config.js", { cause: error });`
   - Why: keeps original error chain for Sentry and console diagnostics.

4. `Error.cause` for org-switch API failures
   - File: `web/static/js/core.js:356`
   - Current: `throw new Error(err.message || "Failed to switch organisation");`
   - Suggested:
     `throw new Error(err.message || "Failed to switch organisation", { cause: err });`
   - Why: preserves backend payload/context when rethrowing.

5. `Error.cause` for repeated HTTP wrapper errors (Google integration)
   - Files: `web/static/js/bb-google.js:272`, `web/static/js/bb-google.js:317`
     (and similar)
   - Current: `throw new Error(text || `HTTP ${response.status}`);`
   - Suggested: throw a normalised error with status/body attached as cause.
   - Why: improves debugging consistency across integration calls.

6. `Error.cause` for repeated HTTP wrapper errors (Webflow/Slack)
   - Files: `web/static/js/bb-webflow.js:282`, `web/static/js/bb-slack.js:207`
     (and similar)
   - Current: same `text || HTTP status` pattern.
   - Suggested: same normalised wrapping strategy as above.
   - Why: one consistent error model across integration modules.

7. `Promise.withResolvers()` for global ready promises
   - Files: `web/static/js/core.js:198`, `web/static/js/bb-global-nav.js:4`
   - Current: external resolver captured via
     `new Promise((resolve, reject) => { ... })`
   - Suggested: `const { promise, resolve, reject } = Promise.withResolvers();`
   - Why: cleaner orchestration for externally-resolved readiness contracts.

8. `Promise.withResolvers()` for script-loader internals
   - File: `web/static/js/core.js:22`, `web/static/js/core.js:40`
   - Current: two hand-rolled promise constructors in `loadScript`.
   - Suggested: use `withResolvers` to simplify resolve/reject lifecycle
     handling.
   - Why: reduces boilerplate and event-listener error-path complexity.

9. `Error.cause` for extension/CLI session hand-off
   - Files: `web/static/js/auth.js:1946`, `web/static/js/auth.js:2184`
   - Current: message-only rethrows (`error?.message || ...`).
   - Suggested: retain original Supabase error in `cause`.
   - Why: better traceability when auth hand-off fails in browser/extension
     contexts.

## Rollout notes

- Keep changes incremental and behavioural-neutral (syntax and error-chain
  quality only).
- For `Promise.withResolvers()`, confirm browser support baseline for your
  target audience before broad rollout.
- Prefer a tiny shared helper for HTTP error normalisation to avoid repeating
  the same pattern across integration files.

## Suggested implementation order

1. Start with `at()` and `Object.hasOwn()` (lowest risk, immediate readability
   wins).
2. Add `Error.cause` in `core.js` and `auth.js` first (highest debugging value).
3. Standardise HTTP error wrapping in integration modules.
4. Introduce `Promise.withResolvers()` last (only if browser support baseline is
   acceptable).
