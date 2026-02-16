# Go Principles Audit (Medium Article Mapping)

Estimate note: LOC ranges below are approximate net changed lines (Go + tests
where relevant), excluding migration/docs churn unless stated.

## High Priority

### 1) Context as Contract (Tips #1 and #5)

- Relevance: High for this app due to long-running workers, background jobs, and
  API-triggered async work.
- Current status: Partially followed.
- Already doing:
  - Context passed through interfaces and service calls
    (`internal/jobs/interfaces.go:12`, `internal/jobs/interfaces.go:21`).
  - Cancellation checks in long-running loops (`internal/jobs/worker.go:1291`,
    `internal/notifications/listener.go:39`).
- Gaps:
  - Detached contexts using `context.Background()` in active flows can bypass
    caller/app cancellation (`cmd/app/main.go:766`, `internal/api/jobs.go:263`,
    `internal/jobs/manager.go:333`, `internal/jobs/manager.go:343`).
- Benefit of improving: Better graceful shutdown, fewer orphaned goroutines,
  fewer "work continued after cancel" incidents.
- Approx LOC required: ~80-180 lines.

### 2) Keep APIs Boring and Safe (Tip #10)

- Relevance: High for stability/latency.
- Current status: Mixed.
- Already doing:
  - Input validation and early rejection are widespread
    (`internal/api/jobs.go:307`, `internal/api/schedulers.go:121`).
  - Server `ReadHeaderTimeout` configured (`cmd/app/main.go:718`).
- Gaps:
  - Many per-call `http.Client` constructions instead of reusing shared clients
    (`internal/api/webflow_sites.go:689`, `internal/api/auth_google.go:771`,
    `internal/api/slack.go:265`).
- Benefit of improving: Lower connection churn, more predictable
  latency/resource usage under load.
- Approx LOC required: ~120-260 lines.

## Medium Priority

### 3) Wrap Errors with Context (Tip #2)

- Relevance: Medium-high (operability/incident debugging).
- Current status: Strongly followed.
- Evidence:
  - Wrapped errors with `%w` are common (`internal/jobs/manager.go:194`,
    `internal/loops/client.go:164`).
- Benefit of further work: Mostly consistency polish, not major structural
  change.
- Approx LOC required: ~20-80 lines.

### 4) Use `errors.Is` / `errors.As` (Tip #3)

- Relevance: Medium.
- Current status: Followed.
- Evidence:
  - Sentinel/type-safe checks used (`internal/jobs/worker.go:1220`,
    `internal/db/batch.go:79`, `internal/api/schedulers.go:389`).
- Benefit of further work: Keep consistency; avoid regressions to string
  matching.
- Approx LOC required: ~10-50 lines.

### 5) Bound Concurrency (Tip #4)

- Relevance: Medium-high for workload spikes.
- Current status: Strongly followed.
- Evidence:
  - Worker-level semaphores and worker caps (`internal/jobs/worker.go:111`,
    `internal/jobs/worker.go:461`, `internal/jobs/worker.go:443`).
  - Queue semaphore for DB pressure control (`internal/db/queue.go:114`).
- Benefit of further work: Tuning only; foundations are already solid.
- Approx LOC required: ~20-100 lines.

### 6) Measure with pprof (Tip #8)

- Relevance: Medium.
- Current status: Followed.
- Evidence:
  - Protected pprof endpoints available (`internal/api/handlers.go:11`,
    `internal/api/handlers.go:371`).
- Benefit of further work: Operational practice improvements (regular profile
  reviews), not major code changes.
- Approx LOC required: ~10-40 lines.

## Low Priority

### 7) Defer Usage in Hot Loops (Tip #6)

- Relevance: Low right now.
- Current status: No major production anti-pattern found.
- Note:
  - Loop+`defer` usage appears mainly in tests.
- Benefit of further work: Minor micro-optimization unless profiling shows
  overhead.
- Approx LOC required: ~0-30 lines.

### 8) Zero Values as Design Tool (Tip #7)

- Relevance: Low.
- Current status: Neutral/partially idiomatic.
- Note:
  - Code generally uses idiomatic zero-value-safe slices/maps/mutexes where
    expected.
- Benefit of further work: Incremental API/type ergonomics improvements.
- Approx LOC required: ~20-120 lines.

### 9) Test Maintainability and Flake Resistance (Tip #9)

- Relevance: Low-medium (quality), but lower urgency than runtime stability.
- Current status: Good with some flake risk points.
- Already doing:
  - Extensive table-driven tests (`internal/util/request_test.go:12`,
    `internal/crawler/robots_test.go:9`).
- Gaps:
  - Some `time.Sleep`-based tests may become flaky
    (`internal/crawler/crawler_test.go:177`,
    `internal/api/middleware_test.go:460`).
- Benefit of further work: More deterministic CI and fewer intermittent
  failures.
- Approx LOC required: ~60-200 lines.

## Suggested Execution Order

1. Fix context detachment and goroutine lifecycle wiring.
2. Consolidate/reuse outbound HTTP clients in API integrations.
3. Replace highest-risk sleep-based tests with deterministic synchronization.
4. Continue consistency improvements for error handling patterns.
