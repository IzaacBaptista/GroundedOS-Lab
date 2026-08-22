# etl

Extract, Transform, Load pipeline for ingesting multimodal documents into a uniform schema suitable for LLM systems.

## Responsibilities

- Extract content from supported source modalities (for example text, PDF, image, audio, CSV, Markdown, and HTML)
- Normalize documents into a uniform internal schema (`NormalizedDocument`)
- Apply chunking, cleaning and metadata enrichment
- Load processed documents into vector stores and databases
- Support synthetic data generation and data augmentation

## Status

Current baseline: text + PDF + image + audio ingestion are runnable with
provider-based multimodal extraction hooks; additional modalities remain planned.

## Current plan

Execution follows the repository-level plan at
[`docs/phase-0-mvp-plan.md`](../../docs/phase-0-mvp-plan.md), focused on an ETL MVP that is locally runnable and testable.

### ETL milestones (active)

1. Keep `text` ingestion stable and covered by tests
2. ✅ Implement first functional `pdf` extractor
3. ✅ Add provider-based image OCR/description and audio transcription paths
4. ✅ Expose one local smoke command and document expected output shape

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

Run the local smoke command from the repository root:

```bash
npm run ingest:smoke
```

The command reads the `phase-0-smoke-text` dataset from
[`datasets/registry.json`](../../datasets/registry.json), verifies its checksum,
runs a real `text` ingestion through the dispatcher, and prints a
`NormalizedDocument` JSON payload.

Expected output includes:

| Field | Expected value |
|---|---|
| `documentId` | `smoke-text-001` |
| `title` | `ETL Smoke Test` |
| `modality` | `text` |
| `lineage.extractor` | `text-extractor` |
| `content.sections` | Two paragraph sections |

To run a different registered dataset, pass its ID:

```bash
npm run ingest:smoke -- <dataset-id>
```

```ts
import { ingest } from "./src";

const doc = await ingest({
  type: "text",
  content: "Hello world\n\nThis is a second paragraph.",
  metadata: { title: "My first document" },
});
// doc.content.sections → [ { id: "section-1", text: "Hello world", … }, … ]
```

PDF files can be ingested through the same dispatcher:

```ts
const pdfDoc = await ingest({
  type: "pdf",
  filePath: "./sample.pdf",
  metadata: { title: "Sample PDF" },
});
// pdfDoc.content.sections → one section per PDF page with extractable text
```

## Document Schema

The ETL pipeline consumes an `IngestionInput` and produces a `NormalizedDocument`.
Core types are defined in [`packages/core`](../core/README.md) and re-exported
from `packages/etl/src/index.ts` for convenience.

## Extractors

| Modality | Class | Status | Notes |
|---|---|---|---|
| `text` | `TextExtractor` | ✅ Complete | Inline `content` or `filePath`; paragraph-based section splitting |
| `pdf` | `PdfExtractor` | ✅ Complete | Local `filePath` or remote `url`; page-based text extraction; detected tables (via `PDFParse.getTable()`, real vector-geometry detection) rendered as Markdown tables, not flattened |
| `image` | `ImageExtractor` | ✅ Baseline | OCR + image description via provider abstraction. Real providers exist (`TesseractOcrProvider`, `OllamaVisionProvider`) but default to `Mock*Provider` unless opted in — see "Real multimodal providers (opt-in)" below |
| `audio` | `AudioExtractor` | ✅ Baseline | Transcription via provider abstraction. Real provider exists (`OpenAIWhisperProvider`) but defaults to `MockTranscriptionProvider` unless `OPENAI_API_KEY` is set |
| `csv` | — | 🔲 Planned | Row/column → section mapping |
| `markdown` | `MarkdownExtractor` | ✅ Complete | Heading-aware section splitting (ATX `#`..`######`) |
| `html` | `HtmlExtractor` | ✅ Baseline | Regex-based tag stripping; drops `<script>`/`<style>`; no table/structure extraction yet |
| `json` | `JsonExtractor` | ✅ Complete | One section per top-level key; nested values rendered hierarchically (`renderStructuredValue`), not flattened |
| `xml` | `XmlExtractor` | ✅ Complete | Parsed via `fast-xml-parser`, one section per root child; same hierarchical renderer as JSON |

### Normalization (book cap. 7)

Every document returned by `ingest()` passes through `normalizeDocument()`
(`src/normalization/normalize.ts`) before reaching the caller — this runs
regardless of modality, unlike the multimodal providers above:

- Fixes common mojibake encoding (e.g. `"CafÃ©"` → `"Café"`).
- Strips non-printable control characters and collapses excess whitespace/blank lines (Unicode NFKC).
- Detects and strips a header/footer line repeated across ≥50% of page-like sections (pattern-matched, so a page number inside the line doesn't defeat detection).
- Drops exact-duplicate sections, keeping the first occurrence.
- Recomputes `fullText` and every section's `startOffset`/`endOffset` against the cleaned content.

Header/footer detection only runs with 3+ sections by default
(`minSectionsForHeaderFooterDetection`), to avoid false positives on short
documents where a repeated short line might be real content, not a footer.

### Code-aware chunking (book cap. 8)

`@groundedos/rag`'s `chunkDocument()` detects code files by
`lineage.originalFilename` extension (`.ts`, `.py`, `.go`, etc.) and switches
to a unit-based chunker that never splits a function/class body across
chunks unless the unit alone exceeds `maxChunkChars`. Unit boundaries are
heuristic (blank line followed by a non-indented line) — see the `ponytail:`
comment on `sliceCodeSectionText` for the upgrade path if this needs real
per-language parsing.

### Real multimodal providers (opt-in)

`MockOCRProvider`/`MockVisionProvider`/`MockTranscriptionProvider` are the
defaults — they return fabricated text (e.g. `"OCR extracted text from
${filename}"`) with no real model/OCR/API call. Real implementations:

| Capability | Real provider | Enabled by |
|---|---|---|
| Image description | `OllamaVisionProvider` (`/api/chat` with a vision model, e.g. `llava`) | `GROUNDEDOS_ENABLE_LLM_GENERATION=true` |
| OCR | `TesseractOcrProvider` (local, `tesseract.js`, no API key) | `GROUNDEDOS_ENABLE_REAL_OCR=true` |
| Audio transcription | `OpenAIWhisperProvider` (`/v1/audio/transcriptions`) | `OPENAI_API_KEY` set |

`resolveOcrProvider()` / `resolveVisionProvider()` / `resolveTranscriptionProvider()`
(`src/multimodal/providers/resolve.ts`) pick the real or mock provider based
on these env vars and are the constructor defaults for `ImageExtractor`,
`PdfExtractor` and `AudioExtractor`.

### Adding a new extractor

1. Create `src/extractors/<modality>.ts` and implement the `Extractor` interface.
2. Register an instance in the `EXTRACTOR_REGISTRY` array in `src/dispatcher.ts`.
3. Re-export the class from `src/index.ts`.

## Success Criteria (Phase 0)

- [x] Unified `IngestionInput` entry point defined in `packages/core`
- [x] `Extractor` interface defined in `packages/core`
- [x] Dispatcher routes by modality with clear error for unregistered types
- [x] `TextExtractor` — working plain-text ingestion with section splitting
- [x] `PdfExtractor` — working PDF text extraction into page sections
- [ ] Ingests image and audio files into `NormalizedDocument`
- [x] At least one sample dataset registered in `datasets/`
- [x] Pipeline is runnable locally with a single smoke command for `text`
