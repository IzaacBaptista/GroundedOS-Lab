# ADR-016 — Test Impact Analysis: diff-based test selection via Vitest --changed

**Status:** Proposed

## Context

CI (`.github/workflows/ci.yml`, job `test`) runs `vitest run` unconditionally on every `push`/`pull_request` to `main`/`develop` — the full suite, no filtering. Today that's 63 co-located TS test files across `apps/api`, `apps/web`, and per-domain `packages/*/src`; the cost is still small, but it grows linearly with the repo and there's no selection mechanism at all today (only hand-maintained path-list npm scripts like `test:rag`, `test:harness`, which are curated subsets, not diff-based).

The idea of an AI agent reading a PR's diff and picking which tests to run (Test Impact Analysis) was proposed as a way to speed up CI as the suite grows. Before building that, it's worth checking what the toolchain already gives for free.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **Vitest `--changed <ref>`** | Native to the test runner already in use, resolves via the same import graph Vite uses to bundle — no new tooling, no manual mapping table to maintain, zero infra | Only follows structural (import) relationships; misses coupling that isn't a TS import (e.g. an HTTP contract between `apps/api` and `apps/web` with no shared import) |
| **Turborepo affected graph** | Already scoped in [ADR-004](./ADR-004-monorepo-tooling.md) as future work; gives package-level affected-task selection plus build caching | New tool to adopt; ADR-004 explicitly deferred it until uncached full-repo builds are a measured problem — that threshold hasn't been reached |
| **LLM agent selecting tests from the diff** (the article's approach) | Can reason about non-structural coupling a static graph can't see (cross-service contracts, config-driven behavior) | Added latency/API cost per PR, non-deterministic output, needs a maintained prompt and a safe fallback when it under-selects |

## Decision

Adopt `vitest run --changed <base-ref>` for the `test` job on `pull_request` events, keeping a full unfiltered `vitest run` on `push` to `main`/`develop` as a safety net. Do not adopt Turborepo now (ADR-004's deferral still holds — no measured build-time pain) and do not add an LLM selection layer — the import-graph approach already covers the common case (a change to `packages/rag/src/chunking.ts` runs tests that import it, directly or transitively) with zero new moving parts. Revisit only if `--changed` demonstrates real false negatives that the import graph structurally can't see.

## Consequences

- PR CI gets faster as the suite grows, proportional to how localized a change is.
- False-negative risk (an affected test not caught because there's no import edge — e.g. an API/frontend contract, or runtime config) is mitigated by the full run still happening on every push to `main`/`develop`, not eliminated.
- The `harness` job's suites (`test:harness`, `test:rag`, `test:providers`, `test:agents`) are cross-package integration/eval runs, deliberately excluded from selection — they stay on the full-run path in every event, since they're few and the risk of skipping one outweighs the time saved.
- No new dependency, no new config file to maintain beyond the workflow itself.
