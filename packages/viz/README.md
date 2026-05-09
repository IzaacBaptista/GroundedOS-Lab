# viz

Visualization package for inspecting embeddings, similarity maps and retrieval results.

## Responsibilities

- Render embedding spaces using dimensionality reduction (t-SNE, UMAP)
- Visualize chunk similarity scores and clustering
- Display retrieval results with relevance scores and document origins
- Provide interactive charts for latency, cost and quality metrics
- Export visualizations for reports and presentations

## Status

Scaffold placeholder. Phase 4 embedding visualization is currently delivered in
`apps/web`; this package is reserved for future extraction and reuse.

## Current source of truth

- Active visualization UX is implemented in the web app (`apps/web`) and reads
  persisted index data from API responses.
- This package should stay lightweight until multiple surfaces need shared
  visualization primitives.

## Extraction criteria

Move visualization logic into `packages/viz` when at least one of the following
is true:

1. Both web and another runtime (CLI/reporting/notebook export) require the same chart generation contracts.
2. Embedding-space transforms (projection/clustering) need a reusable API with tests.
3. Visualization data models diverge from UI components and warrant package boundaries.

## Next milestones

1. Define reusable visualization contracts (input/output shape, metadata labels).
2. Extract projection utilities and cluster labeling logic into package modules.
3. Add baseline tests for deterministic projection pipelines.
