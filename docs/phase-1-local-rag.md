# Phase 1 Local RAG Usage

Phase 1 now has a local, executable RAG foundation. It runs without external
model APIs, production vector databases, API servers or web UI.

## Commands

Run the ETL smoke test against the registered sample dataset:

```bash
npm run ingest:smoke
```

Run the registered sample dataset through the local RAG pipeline:

```bash
npm run rag:smoke -- --dataset phase-0-smoke-text --query "What does this command verify?"
```

Ask a grounded question against a direct local text or PDF file:

```bash
npm run rag:ask -- --file datasets/samples/phase-0-smoke.txt --type text --query "What does this command verify?"
```

`rag:ask` also supports positional input:

```bash
npm run rag:ask -- ./notes.txt "What are the main points?"
```

## Pipeline

Both RAG commands execute the same local pipeline:

```text
source document
  -> ingest()
  -> chunkDocument()
  -> embedChunks()
  -> InMemoryVectorStore
  -> retrieveForDevMode()
  -> grounded answer JSON
```

The output includes:

- `answer.grounded` and a simple answer generated from the top retrieved chunk
- citation metadata for the answer
- retrieved chunk IDs, scores, source metadata and offsets
- Dev Mode retrieval output matching
  [`phase-1-dev-mode-output.md`](./phase-1-dev-mode-output.md)
- index metadata such as chunk count, embedding provider and vector dimensions

## Current Limits

- The CLI answer is extractive: it quotes the top retrieved chunk instead of
  calling an LLM.
- `rag:smoke` and `rag:ask` use a deterministic lexical provider for local
  retrieval reproducibility.
- Package tests use deterministic stub providers; they are not semantic quality
  baselines.
- The vector store is in memory only.
- There is no API upload endpoint or web UI yet.
- There is no reranking, token accounting, latency tracing or model routing yet.

## Next Step

The local package and CLI layer are ready to be wrapped by an API surface. The
first API surface is available with:

```bash
npm run api:dev
```

It exposes `GET /health` and JSON-only `POST /rag/ask` for inline text content.
The next implementation target is multipart upload support for local files and
PDFs.
