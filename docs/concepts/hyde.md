# HyDE

## What it is

HyDE (Hypothetical Document Embeddings) creates a synthetic answer-like document and embeds that text to improve recall for sparse or ambiguous queries.

## Why it matters

Some questions do not share enough exact surface form with the target chunk. HyDE expands the query into a richer semantic representation before retrieval.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/rag`](../../packages/rag/src/advanced-retrieval.ts) | Generates the hypothetical retrieval document and tracks retrieval deltas. |
| [`packages/rag`](../../packages/rag/src/retrieval.ts) | Runs auxiliary HyDE retrieval and fuses it with the hybrid baseline. |
| [`apps/web`](../../apps/web/src/components/tabs/ChunksTab.tsx) | Shows the hypothetical document preview in Dev Mode. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Extra embedding cost** | HyDE requires at least one extra embedding pass per query. |
| **Synthetic drift** | A poor hypothetical document can bias retrieval toward the wrong evidence. |
