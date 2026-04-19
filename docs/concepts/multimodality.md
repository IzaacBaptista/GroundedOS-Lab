# Multimodality

## What it is

**Multimodality** is the ability to ingest, process or reason over more than one type of input, such as text, PDFs, images, audio, CSV, Markdown or HTML.

## Why it matters

Real knowledge work rarely arrives as plain text only. GroundedOS Lab treats multimodal ingestion as a data foundation problem: each source format should be normalized into a shared document schema before downstream chunking, retrieval, evals or agents use it.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/core`](../../packages/core/README.md) | Defines document modality and normalized document types. |
| [`packages/etl`](../../packages/etl/README.md) | Routes each modality to an extractor and produces `NormalizedDocument`. |
| [`packages/rag`](../../packages/rag/README.md) | Consumes normalized sections regardless of original modality. |
| [`docs/concepts/uniform-document-schema.md`](./uniform-document-schema.md) | Describes the shared data contract for multimodal documents. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Coverage vs quality** | Supporting many modalities is useful, but each extractor needs modality-specific quality work. |
| **Normalization loss** | Tables, layout, images and audio timing can be simplified or lost during extraction. |
| **Operational cost** | OCR, transcription and parsing can add latency and dependencies. |
