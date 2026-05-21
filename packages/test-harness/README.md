# @groundedos/test-harness

Reusable testing helpers and lightweight harness adapters for GroundedOS Lab packages and apps.

## Responsibilities

- Provide deterministic helpers for provider and RAG tests
- Expose harness utilities for eval, agents, jobs, replay, and experiments
- Standardize fixture setup and temporary runtime utilities across test suites
- Keep harness ergonomics simple for CI and local smoke validation

## Exports

Top-level modules exposed by `src/index.ts`:

- `api`
- `rag`
- `providers`
- `evals`
- `agents`
- `jobs`
- `replay`
- `experiments`
- `datasets`

Representative helpers:

- `makeProviderTestCase`, `runProviderCompatibilitySuite`
- `makeRagTestCase`, `buildTestIndex`, `resetRagRuntimeState`
- `runEvalDataset`, `compareEvalRuns`
- `createTestServer`, `createTestWorker`
- `captureExecutionSnapshot`, `replayExecution`
- `executeExperiment`
- `loadGoldenDataset`

## Local Usage

From repository root:

```bash
# Run harness package tests only
npm run test:harness

# Run focused slices that include harness integrations
npm run test:providers
npm run test:rag
npm run test:agents

# Run deterministic eval harness smoke pipeline
npm run eval:harness
```

## Design Notes

- Cross-cutting contracts live in `@groundedos/core`.
- This package focuses on test orchestration helpers and adapters.
- External runtime tools (for example BullMQ) are wrapped by harness helpers and should not leak into core contracts.

## Status

In progress: first-slice harness foundation is implemented and used by CI-facing tests; additional deep integrations and broader datasets can be expanded incrementally.
