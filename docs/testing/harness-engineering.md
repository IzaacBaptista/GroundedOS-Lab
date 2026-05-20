# Harness Engineering (Incremental Rollout)

Harness Engineering in GroundedOS-Lab is implemented incrementally, with transversal contracts stabilized before deeper harness integrations.

## Rollout Order

1. Core contracts
2. Provider harness
3. Dataset schema + minimal golden fixtures
4. RAG harness
5. API harness
6. Eval harness
7. Agent harness
8. Jobs harness
9. Replay harness
10. Experiment harness
11. CI integration

## First Slice (Implemented)

- Core contracts in `@groundedos/core` include:
  - `ExecutionSnapshot`
  - `EvalReport`
  - `GoldenDataset`
  - `GoldenDatasetItem`
  - `ReplayComparisonResult`
- Dataset loader contract:
  - `loadGoldenDataset(path)`
- Minimal fixture dataset:
  - `datasets/golden/harness-smoke-v1/dataset.json`
- Basic provider harness helpers in `@groundedos/test-harness`:
  - `assertEmbeddingVector()`
  - `assertDeterministicEmbedding()`
  - `runProviderCompatibilitySuite()`

## Design Rules

- Cross-cutting contracts belong in `packages/core`.
- Harness helpers belong in their specific package/app scope.
- External tools/frameworks (for example RAGAS, DeepEval, BullMQ) should be integrated via adapters, not as core contract dependencies.
