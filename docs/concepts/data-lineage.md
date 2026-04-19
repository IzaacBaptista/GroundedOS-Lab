# Data Lineage

## What it is

**Data lineage** records where data came from, how it was processed, which version of a component produced it and when each step occurred.

## Why it matters

Grounded answers are only auditable if the system can trace them back to source documents, extraction versions, chunks, retrieval decisions and model calls. Lineage supports reproducibility, debugging and safe reprocessing.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/core`](../../packages/core/README.md) | Defines lineage fields on `NormalizedDocument`. |
| [`packages/etl`](../../packages/etl/README.md) | Produces lineage when extracting and normalizing documents. |
| [`packages/rag`](../../packages/rag/README.md) | Carries document and chunk provenance into retrieval. |
| [`packages/observability`](../../packages/observability/README.md) | Traces requests and pipeline stages end to end. |
| [`packages/evals`](../../packages/evals/README.md) | Associates scores with documents and pipeline versions. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Auditability vs storage** | Detailed lineage adds metadata volume. |
| **Consistency** | Every pipeline stage must preserve identifiers for lineage to remain useful. |
| **Versioning** | Component upgrades require clear migration and reprocessing rules. |
