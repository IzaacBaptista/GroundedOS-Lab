# ADR-005 — Minimal provider contracts before package extraction

**Status:** Accepted

## Context

GroundedOS Lab has a `packages/` directory with folders for `rag`, `agents`, `memory`, `safety`, `evals`, `model-routing` and others. The risk is creating extensive package scaffolding before there is a concrete implementation to justify the boundaries. Over-abstracted empty packages slow contributors down and make the codebase feel more complete than it is.

This ADR defines the minimum set of TypeScript interfaces that must exist in `packages/core` before any feature code is written. These contracts are the *only* design work that should happen ahead of implementation — everything else should emerge from working code.

## Decision

Define these six provider interfaces in `packages/core/src/types/providers.ts`. They are the seams where one system component hands off to another. Keep them minimal: the smallest surface that makes the behaviour observable and swappable.

### `EmbeddingProvider`

```typescript
export interface EmbeddingProvider {
  readonly name: string;
  embed(texts: string[]): Promise<number[][]>;
}
```

`name` is used in Dev Mode output and index metadata so the embedding provider is always traceable.

### `VectorStore`

```typescript
export interface VectorStoreEntry<M = Record<string, unknown>> {
  id: string;
  vector: number[];
  metadata: M;
}

export interface VectorStoreSearchResult<M = Record<string, unknown>> {
  id: string;
  score: number;
  metadata: M;
}

export interface VectorStore<M = Record<string, unknown>> {
  insert(entries: VectorStoreEntry<M>[]): Promise<void>;
  search(query: number[], topK: number): Promise<VectorStoreSearchResult<M>[]>;
  delete(ids: string[]): Promise<void>;
}
```

The generic `M` is the metadata shape attached to each stored chunk. This keeps the store implementation independent of the chunk schema.

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

Until all three conditions are met, the implementation lives in `packages/core` alongside the interface.

## Consequences

- `packages/core/src/types/providers.ts` exports all six interfaces.
- All existing implementations (`LocalHashEmbeddingsProvider`, `InMemoryVectorStore`, `OllamaEmbeddingsProvider`) must implement the relevant interface from this file.
- New implementations must satisfy the interface before being merged.
- The `LLMProvider` interface is required before any LLM call is added — no direct `fetch` to OpenAI or Ollama from route handlers.
- `Evaluator` and `Guardrail` interfaces serve as the acceptance criteria for Phase 3 — an implementation that satisfies these interfaces constitutes a working eval or guardrail.
