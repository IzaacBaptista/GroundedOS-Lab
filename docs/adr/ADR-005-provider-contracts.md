# ADR-005 — Minimal provider contracts before broad package extraction

**Status:** Accepted

## Context

GroundedOS Lab has a `packages/` directory with folders for `rag`, `agents`, `memory`, `safety`, `evals`, `model-routing` and others. The risk is creating extensive package internals before there is a concrete implementation to justify the boundaries. Over-abstracted empty packages slow contributors down and make the codebase feel more complete than it is.

This ADR defines the minimum provider-contract direction for future cross-package extraction. Existing Phase 1 contracts currently live next to the working RAG implementation in `packages/rag`; shared contracts should move into `packages/core` only when at least two packages or apps need the same boundary.

## Decision

Keep provider interfaces minimal: the smallest surface that makes behavior observable and swappable. The Phase 1 embedding and vector-store contracts remain in `packages/rag` while only the RAG package uses them. When Phase 3 introduces agents, guardrails, evals and model routing, promote stable shared contracts into `packages/core/src/types/providers.ts`.

### `EmbeddingProvider`

```typescript
export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embedTexts(texts: string[]): Promise<number[][]>;
}
```

`name` is used in Dev Mode output and index metadata so the embedding provider is always traceable.

### `VectorStore`

```typescript
export interface VectorSearchQuery {
  embedding: number[];
  topK?: number;
  filter?: Record<string, string | number | boolean | undefined>;
}

export interface VectorSearchResult<Chunk = unknown> {
  chunk: Chunk;
  score: number;
}

export interface VectorStore<Chunk = unknown> {
  readonly size: number;
  insert(chunks: Chunk[]): void;
  search(query: VectorSearchQuery): VectorSearchResult<Chunk>[];
  clear(): void;
}
```

The generic `Chunk` is the stored chunk shape. This keeps the store implementation independent of a specific retrieval schema when the contract is promoted.

### `Retriever`

```typescript
export interface RetrieverResult<M = Record<string, unknown>> {
  chunkId: string;
  score: number;
  text: string;
  metadata: M;
}

export interface Retriever<M = Record<string, unknown>> {
  retrieve(query: string, topK: number): Promise<RetrieverResult<M>[]>;
}
```

A `Retriever` is a higher-level abstraction over `EmbeddingProvider + VectorStore`. It owns the "embed query → search → return ranked results" flow. This is the interface that callers use — they should not call `EmbeddingProvider` and `VectorStore` directly.

### `LLMProvider`

```typescript
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
}

export interface LLMProvider {
  readonly name: string;
  complete(messages: LLMMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<LLMResponse>;
}
```

`usage` and `model` are required — every LLM call must emit token counts and the model name for observability and cost tracking.

### `Evaluator`

```typescript
export interface EvalInput {
  question: string;
  answer: string;
  retrievedChunks: Array<{ chunkId: string; text: string; score: number }>;
  expectedChunkIds?: string[];
}

export interface EvalResult {
  score: number;          // 0.0–1.0
  passed: boolean;
  label: string;          // e.g. "faithfulness", "recall@3"
  details?: string;
}

export interface Evaluator {
  readonly name: string;
  evaluate(input: EvalInput): Promise<EvalResult>;
}
```

### `Guardrail`

```typescript
export interface GuardrailInput {
  text: string;
  role: 'user' | 'assistant';
  metadata?: Record<string, unknown>;
}

export interface GuardrailResult {
  blocked: boolean;
  reason?: string;
  sanitized?: string;
}

export interface Guardrail {
  readonly name: string;
  check(input: GuardrailInput): Promise<GuardrailResult>;
}
```

`sanitized` is the PII-stripped or otherwise modified version of the text. If `blocked` is false, the caller uses `sanitized ?? input.text` downstream.

## When to extract a package

A new package in `packages/` is justified when **all three** of these are true:

1. There is a concrete implementation of at least one of the interfaces above.
2. The implementation is used by at least two other packages or apps.
3. The contract has been stable through at least one real usage cycle.

Until all three conditions are met, the implementation and its narrow interface live with the package that owns the behavior.

## Consequences

- Phase 1 keeps `EmbeddingProvider`, `SemanticEmbeddingsProvider`, `LocalHashEmbeddingsProvider`, `OllamaEmbeddingsProvider` and `InMemoryVectorStore` in `packages/rag` until another package needs the same boundary.
- `packages/core/src/types/providers.ts` should be added when contracts become cross-package concerns.
- New provider implementations must satisfy the local package interface before being merged.
- The `LLMProvider` interface is required before any LLM call is added — no direct `fetch` to OpenAI, Anthropic or Ollama from route handlers.
- `Evaluator` and `Guardrail` interfaces serve as the acceptance criteria for Phase 3 — an implementation that satisfies these interfaces constitutes a working eval or guardrail.
