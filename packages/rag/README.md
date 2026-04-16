# rag

Retrieval-Augmented Generation pipeline. Implements the full retrieval stack from document ingestion to context assembly.

## Responsibilities

- Chunk and embed documents into vector representations
- Perform hybrid search (dense + sparse) over the vector store
- Re-rank retrieved candidates for relevance
- Assemble the final context window for LLM inference
- Support Adaptive RAG (decide when retrieval is needed)

## Status

Planned
