# Ollama Setup

This guide shows how to install Ollama, verify the local embedding API, and run
GroundedOS Lab with `embeddingProvider: "ollama"`.

It is intentionally practical: install first, verify Ollama itself, then verify
the GroundedOS integration.

## What This Enables

After this setup, you can use a real local semantic embedding provider instead
of the deterministic development providers:

- `api-lexical` keeps the current deterministic lexical baseline
- `local-hash` keeps the current deterministic semantic-like baseline
- `ollama` uses a real local embedding model through `POST /api/embed`

## Prerequisites

- Node.js `>=20`
- This repository installed locally
- Enough disk space for Ollama plus at least one embedding model

From the repository root, make sure the project itself is healthy:

```bash
npm run build
npm test
```

## 1. Install Ollama

Choose the path that matches your OS.

### macOS

1. Open the official macOS page: `https://docs.ollama.com/macos`
2. Download the Ollama app (`.dmg`)
3. Move Ollama to `Applications`
4. Launch it once
5. Confirm the `ollama` CLI is available:

```bash
ollama -v
```

On macOS, Ollama normally runs in the background after the app starts.

### Windows

1. Open the official Windows page: `https://docs.ollama.com/windows`
2. Download and run `OllamaSetup.exe`
3. Let the installer finish
4. Open `PowerShell` or `cmd`
5. Confirm the CLI is available:

```powershell
ollama -v
```

On Windows, Ollama normally runs in the background after installation.

### Linux

The simplest official install path is:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Then start Ollama:

```bash
ollama serve
```

In another terminal, verify the CLI:

```bash
ollama -v
```

If you need a manual install or special GPU package, use the official Linux
page: `https://docs.ollama.com/linux`

## 2. Pull An Embedding Model

GroundedOS currently defaults to `embeddinggemma` for the Ollama provider.

Pull it locally:

```bash
ollama pull embeddinggemma
```

If this step fails, fix the Ollama installation before continuing. GroundedOS
cannot use `embeddingProvider: "ollama"` until Ollama can download and serve
that model.

## 3. Verify Ollama Embeddings Directly

Before involving GroundedOS, confirm that Ollama can answer `/api/embed`.

```bash
curl http://localhost:11434/api/embed \
  -H "Content-Type: application/json" \
  -d '{
    "model": "embeddinggemma",
    "input": "Why is the sky blue?"
  }'
```

Expected result:

- HTTP `200`
- JSON body with:
  - `model`
  - `embeddings`
  - one numeric vector inside `embeddings`

At this point, the Ollama side is working.

## 4. Run GroundedOS With Ollama

Start the API with explicit embedding config:

```bash
GROUNDEDOS_OLLAMA_BASE_URL=http://localhost:11434 \
GROUNDEDOS_OLLAMA_EMBED_MODEL=embeddinggemma \
GROUNDEDOS_OLLAMA_EMBED_DIMENSIONS=768 \
npm run api:dev
```

Relevant environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `GROUNDEDOS_OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `GROUNDEDOS_OLLAMA_EMBED_MODEL` | `embeddinggemma` | Embedding model name |
| `GROUNDEDOS_OLLAMA_EMBED_DIMENSIONS` | `768` | Expected vector size saved in indexes |
| `GROUNDEDOS_OLLAMA_KEEP_ALIVE` | unset | Optional Ollama keep-alive |
| `GROUNDEDOS_OLLAMA_REQUEST_TIMEOUT_MS` | package default | Request timeout override |

The repository now includes reference env files:

- [`.env.example`](../.env.example)
- [`apps/api/.env.example`](../apps/api/.env.example)
- [`apps/web/.env.example`](../apps/web/.env.example)

They are reference files only. Copy values into local `.env` files when needed.
Node-side commands load repository-root `.env`/`.env.local` files, and app
entrypoints also load their app-specific `.env`/`.env.local` files. Variables
already exported in the shell keep priority.

## 5. Test GroundedOS Via API

### Ephemeral ask

```bash
curl -X POST http://localhost:3001/rag/ask \
  -H "content-type: application/json" \
  -d '{
    "type": "text",
    "content": "GroundedOS Lab smoke test.\n\nThis command verifies that the ETL dispatcher can route plain text input from a registered sample dataset and return a NormalizedDocument.",
    "query": "What does this command verify?",
    "topK": 1,
    "embeddingProvider": "ollama"
  }'
```

Check the response for:

- `index.embeddingProvider = "ollama"`
- `index.embeddingModel.model = "embeddinggemma"`
- grounded answer text
- retrieved chunks in `devMode.results`

### Persisted index flow

Index first:

```bash
curl -X POST http://localhost:3001/rag/index \
  -H "content-type: application/json" \
  -d '{
    "type": "text",
    "content": "GroundedOS Lab smoke test.\n\nThis command verifies that the ETL dispatcher can route plain text input from a registered sample dataset and return a NormalizedDocument.",
    "title": "Ollama Smoke",
    "documentId": "ollama-smoke",
    "embeddingProvider": "ollama"
  }'
```

Then ask by `documentId`:

```bash
curl -X POST http://localhost:3001/rag/ask \
  -H "content-type: application/json" \
  -d '{
    "documentId": "ollama-smoke",
    "query": "What does this command verify?",
    "topK": 1
  }'
```

This is the key behavior to validate: the persisted index should still respond
with `index.embeddingProvider = "ollama"`, because GroundedOS uses the provider
saved with the index.

## 6. Test GroundedOS Via Web

With the API already running:

```bash
npm run web:dev
```

Open:

```text
http://localhost:3000
```

Manual flow:

1. Select `Text`
2. Paste a short sample document
3. Choose `ollama` in the embedding provider select
4. Ask a question
5. Click `Index` to persist it
6. Select the saved index
7. Ask again

Check the Dev Mode JSON for:

- `index.embeddingProvider`
- `index.embeddingModel`
- retrieved chunk IDs
- scores
- offsets

## Troubleshooting

### `ollama: command not found`

The install did not complete or the CLI is not in your `PATH`. Fix the Ollama
installation first.

### Connection refused on `localhost:11434`

Ollama is installed but not serving the local API.

- On macOS/Windows: launch the Ollama app
- On Linux/manual CLI usage: run `ollama serve`

### `model not found`

The configured model is not available locally. Pull it:

```bash
ollama pull embeddinggemma
```

Or align `GROUNDEDOS_OLLAMA_EMBED_MODEL` with the model you actually pulled.

### Persisted index dimension mismatch

If you indexed with one Ollama model/dimension config and later changed
`GROUNDEDOS_OLLAMA_EMBED_DIMENSIONS`, GroundedOS will reject the persisted
index. That is expected. Re-index the document with the current config.

### First request is slow

That is normal. Ollama may be loading the model into memory. Later requests are
usually faster.

## Related Docs

- [Phase 1 Local RAG Usage](./phase-1-local-rag.md)
- [Phase 1 Handoff](./phase-1-handoff.md)
- [apps/api README](../apps/api/README.md)
