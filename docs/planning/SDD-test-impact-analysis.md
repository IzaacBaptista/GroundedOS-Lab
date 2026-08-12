# SDD — Test Impact Analysis (diff-based test selection)

Companion to [ADR-016](../adr/ADR-016-test-impact-analysis.md).

## Goal

Reduce PR CI time by running only the tests affected by a diff, without losing coverage on `main`/`develop`.

## Success criteria (checklist format, for direct copy into README Roadmap)

- [x] `test` job in `ci.yml`, on `pull_request` events, runs `vitest run --changed origin/${{ github.base_ref }}`
- [x] Same job, on `push` to `main`/`develop`, still runs full `vitest run` (no `--changed`)
- [x] `harness` job (`test:harness`/`test:rag`/`test:providers`/`test:agents`) is untouched — runs in full on every event, no exceptions
- [x] `actions/checkout` in the `test` job has enough history (`fetch-depth: 0`, or at minimum the base branch ref) for Vitest's git-based `--changed` resolution to work
- [ ] CI time measured on at least 3 real PRs, before/after, recorded in the implementation PR description
- [ ] No regression: full suite (push path) stays green in parallel for an observation period before anyone relies on `--changed` alone

## In scope

- `.github/workflows/ci.yml` — conditional test command based on event type; checkout depth adjustment if needed.
- Documentation: this SDD, [ADR-016](../adr/ADR-016-test-impact-analysis.md), the ADR index row (already added).

## Out of scope (explicit)

- Turborepo / affected-graph adoption — [ADR-004](../adr/ADR-004-monorepo-tooling.md)'s deferral stands; no measured build-time problem to justify it yet.
- LLM-based test selection (the article's original approach) — rejected in ADR-016's Options table; the import-graph approach covers the common case with zero added infra or non-determinism.
- Changes to `lint`, `typecheck`, `docker-build`, `status` jobs.
- Changes to `test:harness`, `test:rag`, `test:providers`, `test:agents` scripts or the `harness` job — they stay full-run, always.
- A source-file → test manifest or mapping config — not needed; Vitest's own import graph already does this.

## Design

Single-point change in `.github/workflows/ci.yml`'s `test` job:

```yaml
- name: Run tests
  run: |
    if [ "${{ github.event_name }}" = "pull_request" ]; then
      npx vitest run --changed origin/${{ github.base_ref }}
    else
      npm test
    fi
```

Requires the job's `actions/checkout` step to fetch enough history for git to resolve `origin/<base_ref>` — shallow clones (the GitHub Actions default) will not have it. Set `fetch-depth: 0` on that checkout step (full history; the repo isn't large enough for this to matter) rather than trying to compute a minimal depth.

No changes to `vitest.config.ts` — `--changed` is a CLI flag, it uses the same resolved config (including the `@groundedos/*` path aliases) already in place, so cross-package imports within the workspace are already tracked correctly.

## Rollout plan

- No feature flag — this only affects which tests run in the `test` job, not runtime behavior.
- No new endpoint or package.
- Suggested PR sequence: (1) this PR — workflow change + `fetch-depth` fix + the two doc files; (2) observation period (full suite still runs on every push to `main`/`develop`) before considering anything further; (3) only revisit Turborepo or an LLM layer if `--changed` is later shown to miss real coverage gaps (per ADR-016's "Options considered" cons column) — not preemptively.

## Decisions (resolved, not reopened)

1. **Mechanism**: Vitest's native `--changed`, not Turborepo, not an LLM agent. See ADR-016.
2. **Safety net**: full suite stays on `push` to `main`/`develop` — not removed, not made conditional on observation results being good; that's a separate future decision if ever revisited.
3. **`harness` job**: excluded from selection entirely, not partially — those suites are integration/eval-level and few enough that "always run" is cheaper than building selection logic for them.
