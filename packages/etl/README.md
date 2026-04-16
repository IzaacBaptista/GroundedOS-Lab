# etl

Extract, Transform, Load pipeline for ingesting multimodal documents into a uniform schema suitable for LLM systems.

## Responsibilities

- Extract content from text, PDF, image and audio sources
- Normalize documents into a uniform internal schema (`NormalizedDocument`)
- Apply chunking, cleaning and metadata enrichment
- Load processed documents into vector stores and databases
- Support synthetic data generation and data augmentation

## Status

🟡 In Progress — Phase 0 (Data Foundation)

## Document Schema

The ETL pipeline consumes a `SourceDocument` and produces a `NormalizedDocument`.
Both types are defined in [`packages/core`](../core/README.md).

```
SourceDocument (raw ingestion record)
        ↓
  [extractor]        ← selects extractor based on modality
        ↓
NormalizedDocument   ← uniform payload for all downstream stages
        ↓
  [chunking stage]   ← splits sections into retrieval chunks (Phase 1)
```

## Planned Extractors

| Modality | Extractor | Notes |
|---|---|---|
| `text` | plain-text reader | Passthrough with section splitting |
| `pdf` | PDF parser | Page-aware section extraction |
| `image` | OCR / captioning model | Via local or cloud vision API |
| `audio` | ASR (Whisper) | Speech-to-text transcription |
| `csv` | CSV parser | Row/column → section mapping |
| `markdown` | Markdown parser | Heading-aware section splitting |
| `html` | HTML extractor | Tag-aware content extraction |

## Success Criteria (Phase 0)

- [ ] Ingests PDF, image and audio files into `NormalizedDocument`
- [ ] At least one sample dataset registered in `datasets/`
- [ ] Pipeline is runnable locally with a single command
