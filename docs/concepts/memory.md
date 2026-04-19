# Memory

## What it is

**Memory** is persisted or session-scoped context that can be reused across turns, workflows or agent runs. It can include conversation summaries, user preferences, retrieved facts, task state or vector-backed recall records.

## Why it matters

Memory lets a grounded system behave consistently over time without stuffing every prior interaction into the context window. It also creates risks: stale, irrelevant or sensitive memory can pollute future outputs.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/memory`](../../packages/memory/README.md) | Owns short-term and long-term memory abstractions. |
| [`packages/agents`](../../packages/agents/README.md) | Uses memory to maintain task state and intermediate reasoning context. |
| [`packages/rag`](../../packages/rag/README.md) | Can combine document retrieval with memory retrieval. |
| [`packages/safety`](../../packages/safety/README.md) | Helps enforce privacy and relevance constraints around stored context. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Continuity vs privacy** | Persisted context improves UX but can retain sensitive information. |
| **Recall vs noise** | Too much memory can distract the model from the current task. |
| **Freshness** | Memory needs update and pruning strategies to avoid stale behavior. |
