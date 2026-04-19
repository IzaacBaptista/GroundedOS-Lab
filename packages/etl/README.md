# etl

Extract, Transform, Load pipeline for ingesting multimodal documents into a uniform schema suitable for LLM systems.

## Responsibilities

- Extract content from supported source modalities (for example text, PDF, image, audio, CSV, Markdown, and HTML)
- Normalize documents into a uniform internal schema (`NormalizedDocument`)
- Apply chunking, cleaning and metadata enrichment
- Load processed documents into vector stores and databases
- Support synthetic data generation and data augmentation

## Status

🟡 In Progress — Phase 0 (Data Foundation)

## Current plan

Execution follows the repository-level plan at
[`docs/phase-0-mvp-plan.md`](../../docs/phase-0-mvp-plan.md), focused on an ETL MVP that is locally runnable and testable.

### ETL milestones (active)

1. Keep `text` ingestion stable and covered by tests
2. Implement first functional `pdf` extractor
3. Keep `image` and `audio` behind explicit, clear not-implemented errors
4. Expose one local smoke command and document expected output shape

## Ingestion Flow

Any content enters the pipeline through the unified `ingest()` function.
The dispatcher routes the `IngestionInput` to the correct extractor based on
`input.type` and returns a `NormalizedDocument`.

```
IngestionInput          ← single entry point for all modalities
  { type, content?,
    filePath?, url?,
    metadata? }
        ↓
  [dispatcher]          ← ingest(input) — selects extractor by input.type
        ↓
  [Extractor]           ← modality-specific: TextExtractor, PdfExtractor, …
        ↓
NormalizedDocument      ← uniform payload for all downstream stages
        ↓
  [chunking stage]      ← splits sections into retrieval chunks (Phase 1)
```

### Quick start

```ts
import { ingest } from "./src";

const doc = await ingest({
  type: "text",
  content: "Hello world\n\nThis is a second paragraph.",
  metadata: { title: "My first document" },
});
// doc.content.sections → [ { id: "section-1", text: "Hello world", … }, … ]
```

## Document Schema

The ETL pipeline consumes an `IngestionInput` and produces a `NormalizedDocument`.
Core types are defined in [`packages/core`](../core/README.md) and re-exported
from `packages/etl/src/index.ts` for convenience.

## Extractors

| Modality | Class | Status | Notes |
|---|---|---|---|
| `text` | `TextExtractor` | ✅ Complete | Inline `content` or `filePath`; paragraph-based section splitting |
| `pdf` | `PdfExtractor` | 🚧 Stub | Registered in dispatcher, currently returns explicit NOT_IMPLEMENTED |
| `image` | `ImageExtractor` | 🚧 Stub | Registered in dispatcher, currently returns explicit NOT_IMPLEMENTED |
| `audio` | `AudioExtractor` | 🚧 Stub | Registered in dispatcher, currently returns explicit NOT_IMPLEMENTED |
| `csv` | — | 🔲 Planned | Row/column → section mapping |
| `markdown` | — | 🔲 Planned | Heading-aware section splitting |
| `html` | — | 🔲 Planned | Tag-aware content extraction |

### Adding a new extractor

1. Create `src/extractors/<modality>.ts` and implement the `Extractor` interface.
2. Register an instance in the `EXTRACTOR_REGISTRY` array in `src/dispatcher.ts`.
3. Re-export the class from `src/index.ts`.

## Success Criteria (Phase 0)

- [x] Unified `IngestionInput` entry point defined in `packages/core`
- [x] `Extractor` interface defined in `packages/core`
- [x] Dispatcher routes by modality with clear error for unregistered types
- [x] `TextExtractor` — working plain-text ingestion with section splitting
- [ ] Ingests PDF, image and audio files into `NormalizedDocument`
- [ ] At least one sample dataset registered in `datasets/`
- [ ] Pipeline is runnable locally with a single command
