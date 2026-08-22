# When Not To Use RAG

## What it is

A decision framework for the opposite question the rest of this repo assumes an answer to: given a concrete problem, is RAG actually the right architecture, or does a simpler alternative solve it better? The candidates are **fine-tuning** (behavior/style change), **long-context** (the corpus fits in the prompt), **SQL/database** (the answer is a lookup or aggregation, not prose), **Knowledge Graph** (the answer depends on relationships, not passages), **an API/tool call** (the answer is live/computed data), or **traditional search** (the user wants a ranked list of documents, not a synthesized answer).

## Why it matters

RAG has real cost: an ingestion pipeline, an index to keep fresh, retrieval failure modes (missing/irrelevant/contradictory chunks), and a generation step that can still hallucinate even with perfect retrieval. Reaching for RAG by default on every "make the AI know about X" request adds that cost even when a five-line SQL query or a well-fitted prompt would answer the question with less complexity and fewer failure modes.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`docs/concepts/rag.md`](./rag.md) | Covers the inverse question (RAG vs fine-tuning/long-context/prompt-engineering) that this doc's decision framework builds on. |
| [`docs/concepts/rag-architectures.md`](./rag-architectures.md) | Assumes RAG is the right call and covers how to structure it; this doc is the gate that should be checked first. |
| [`docs/concepts/graphrag.md`](./graphrag.md) | The Knowledge-Graph alternative referenced in the decision framework below. |

## Decision framework

Ask these in order; stop at the first "yes":

1. **Is the answer a deterministic lookup, filter, or aggregation over structured data** (a count, a sum, "orders placed this week")? → Use **SQL/database**, not RAG. RAG over structured data (turning rows into prose chunks) throws away exactness for no benefit.
2. **Does the answer depend on live or computed state** (current price, today's weather, a running balance)? → Use an **API/tool call**. Indexing something that changes every request means the index is stale before the first query finishes.
3. **Does the answer depend on relationships between entities** more than passage content ("who reports to whom," "which services depend on this one")? → A **Knowledge Graph** (or graph+vector hybrid, see [`graphrag.md`](./graphrag.md)) answers this more directly than similarity search over prose chunks.
4. **Does the whole knowledge base fit comfortably and cheaply in the model's context window**, and does it change rarely enough that re-sending it every call is acceptable? → **Long-context** (stuff it all in the prompt) is simpler than a retrieval pipeline and has no retrieval-failure surface.
5. **Is the problem about behavior, tone, or output format** rather than facts ("always answer in this JSON schema," "sound like this brand voice")? → **Fine-tuning** or prompt engineering changes behavior; RAG changes what facts are available, which doesn't help here.
6. **Does the user want a ranked list of documents to read themselves**, not a synthesized answer? → **Traditional search** (BM25/full-text, no generation step) is a better match for the actual task and avoids introducing hallucination risk where none existed.

If none of the above apply — the answer depends on a fact that's specific to your corpus, changes independently of the model, and needs to be auditable back to a source — that's the case RAG is for.

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Simplicity vs generality** | Every "not RAG" alternative above is simpler for its specific case but doesn't generalize; a system with several different question types may need RAG plus one or more of these alternatives, not RAG instead of them. |
| **Over-application risk** | Defaulting to RAG for everything (including structured lookups and live data) is the most common misuse — it works badly instead of failing loudly, since retrieval over structured/live data still returns *something*. |
| **Migration cost** | Starting with the wrong architecture (e.g. RAG over what should be a SQL query) is expensive to unwind once a UI and evals are built around it — this framework is cheapest to apply before building anything. |
