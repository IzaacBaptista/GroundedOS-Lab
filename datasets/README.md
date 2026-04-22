# datasets

Storage and registry for datasets used in experiments, fine-tuning, benchmarks and bias tests across the monorepo.

## Responsibilities

- Organize raw, processed and synthetic datasets by use case
- Provide metadata and provenance information for each dataset
- Supply evaluation datasets for evals and benchmarks packages
- Document dataset sources, licenses and preprocessing steps

## Status

🟡 In Progress — Phase 0 includes a minimal local smoke dataset.

## Registry

Datasets are registered in [`registry.json`](./registry.json). Each entry records:

| Field | Purpose |
|---|---|
| `id` | Stable identifier used by scripts and tests |
| `modality` | Input modality routed through ETL |
| `path` | File path relative to `datasets/` |
| `source` | Origin of the dataset |
| `license` | Usage license |
| `sha256` | Integrity checksum for reproducible local runs |
| `metadata` | Document metadata passed into ETL |

## Registered datasets

| ID | Modality | Path | Use |
|---|---|---|---|
| `phase-0-smoke-text` | `text` | [`samples/phase-0-smoke.txt`](./samples/phase-0-smoke.txt) | Local ETL smoke test |

## Local usage

From the repository root:

```bash
npm run ingest:smoke
npm run rag:smoke -- --dataset phase-0-smoke-text --query "What does this command verify?"
npm run rag:ask -- --file datasets/samples/phase-0-smoke.txt --type text --query "What does this command verify?"
```

The smoke command reads `phase-0-smoke-text` from the registry, verifies its checksum, runs it through `packages/etl`, and prints the resulting `NormalizedDocument`.
The RAG smoke command uses the same registry entry, then runs local chunking,
embedding, vector search and Dev Mode retrieval output.
The RAG ask command runs the same local retrieval pipeline against a direct
file path, without requiring a registry entry.
