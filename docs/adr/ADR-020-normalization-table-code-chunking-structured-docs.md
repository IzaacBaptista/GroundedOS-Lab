# ADR-020 — Cap. 7 normalization pass, real table extraction, code-aware chunking, JSON/XML modalities

**Status:** Accepted

## Context

Continuing the RAG-book audit (ADR-017/018/019), reading the book's full chapters 6 and 7 (previously only outline/concept lists were available) surfaced four gaps that were genuinely missing functionality, not theater masquerading as real:

1. **Cap. 7 (Normalização e limpeza) had no implementation at all.** No step anywhere fixed encoding, stripped noise, deduplicated repeated page headers/footers, normalized whitespace/Unicode, or deduplicated sections. A paginated PDF with a repeated header/footer on every page indexed that text once per page, unfiltered.
2. **Cap. 6 table extraction**: `PdfExtractor` used `pdf-parse`'s `getText()` only, which flattens tables into unstructured lines — the row/column relationship the book specifically warns is easy to destroy.
3. **Cap. 6 code parsing**: `chunkDocument()`'s only strategy was fixed-size character-window slicing with overlap — no unit-boundary awareness, so a function or class body could (and would) be cut mid-way.
4. **Cap. 6 documentos estruturados**: `DocumentModality` didn't even declare `"json"` or `"xml"` — unlike markdown/html/csv (declared but unimplemented, later fixed in earlier commits), structured document ingestion wasn't planned for at all.

## Options considered

| Gap | Option chosen | Alternatives considered |
|---|---|---|
| Normalization | New `normalizeDocument()` in `packages/etl`, applied unconditionally inside `dispatcher.ts#ingest()` for every modality | Per-extractor normalization (rejected: duplicates logic across 8 extractors; the book explicitly treats this as one pipeline stage, not a per-source concern) |
| Header/footer detection | Pattern-based repeat detection across page-like sections (digits normalized to `#` so a changing page number doesn't defeat matching), gated to 3+ sections | Exact-string matching only (rejected: fails on any footer containing a page number, the single most common real-world footer) |
| Table extraction | Use `pdf-parse`'s existing `getTable()` (already a transitive capability of the dependency already in use — detects real vector-drawn grid lines, not a heuristic) and render as Markdown | Column-alignment heuristics on flat text (rejected: `pdf-parse` already does this better via actual geometry; reinventing it would be strictly worse) |
| Code-aware chunking | Heuristic unit-boundary detection (blank line + non-indented next line) keyed off `lineage.originalFilename`'s extension | Full per-language AST parsing (e.g. tree-sitter) (deferred: real dependency weight and per-language grammar maintenance for a heuristic that already prevents the common case — cutting a function mid-body) |
| JSON/XML modalities | Add `"json"`/`"xml"` to `DocumentModality`; `JsonExtractor` (native `JSON.parse`) and `XmlExtractor` (`fast-xml-parser`, MIT, no native deps) sharing one hierarchy-preserving text renderer | Hand-rolled XML parsing (rejected: XML has enough edge cases — CDATA, entities, self-closing tags — that a maintained parser is safer than a regex approach, unlike the simpler HTML tag-stripping case in ADR-earlier work) |

## Decision

- `packages/etl/src/normalization/normalize.ts`: `normalizeDocument()` runs on every `NormalizedDocument` inside `dispatcher.ts#ingest()`, unconditionally (no opt-in flag — unlike the real-generation ADRs, this has no cost/latency/nondeterminism tradeoff to gate on; it's pure text cleanup).
- `PdfExtractor` now also calls `parser.getTable()` and merges detected tables into their page's text as Markdown, via an injectable `pdfParserFactory` (mirrors the DI pattern used for OCR/vision providers) so the merge logic is unit-testable without needing a real PDF with drawn grid lines.
- `chunkDocument()` branches to `sliceCodeSectionText()` when `document.lineage.originalFilename` has a recognized code extension.
- `JsonExtractor`/`XmlExtractor` added, registered in the dispatcher, sharing `renderStructuredValue()` for hierarchy-preserving text rendering (object → indented `key:` blocks, array → `- item` / `- [i]` blocks).
- New dependencies: `tesseract.js` (ADR-019, unrelated but same session), `fast-xml-parser` (this ADR) — both added to `packages/etl`.

## Consequences

- Every ingested document (any modality) now gets encoding/noise/header-footer/dedup cleanup for free — no flag, no opt-in, always on.
- PDF tables are preserved as Markdown instead of unstructured text; downstream chunking/embedding sees the real row/column relationship.
- Code files chunk along function/class boundaries by default whenever `originalFilename` carries a recognized extension — no configuration needed, but also no way to force code-aware chunking for a file without a recognized extension (e.g. a code snippet pasted as inline `content` with no `filePath`).
- `csv` remains the only originally-planned modality still unimplemented — out of scope for this ADR.
- Header/footer detection, mojibake repair, and code unit boundaries are all heuristic, not exact — each carries a `ponytail:`-style documented ceiling in its source comment for when higher fidelity becomes a real requirement.
