# memory

Memory management layer for persistent and session-scoped context across conversations and agent runs.

## Responsibilities

- Store and retrieve session-scoped conversation memory entries
- Provide file-backed persistence for local development and restart durability
- Offer deterministic lexical recall over recent session entries
- Define contracts that can be reused by future backend adapters

## Status

Implemented (Phase 2b baseline)

## Current implementation

- `FileSessionMemoryStore` persists data under `.groundedos/memory/sessions/<sessionId>.json`.
- Each entry stores `query`, `answer`, and `createdAt`.
- Retrieval uses simple lexical scoring over `query + answer` to return relevant prior turns.
- API integration is in `apps/api/src/rag-service.ts` with optional `sessionId` on ask requests.

## Public contracts

- `SessionMemoryEntry`
- `SessionMemoryStore`
- `SessionMemorySearchOptions`
- `createSessionMemoryStore(options?)`

See implementation in:

- `src/types.ts`
- `src/store.ts`

## Scope and isolation

- Memory scope is strictly per `sessionId`.
- Retrieval and listing only read entries for the requested `sessionId`.
- No cross-session merge or fallback is performed.

## Retention policy (current baseline)

- Entries are retained indefinitely by default in local files.
- No automatic TTL, summarization, or pruning is enabled yet.
- Manual cleanup can be done by removing `.groundedos/memory/`.

## Privacy considerations

- Stored content may include user-provided queries and generated answers.
- Data is written to local disk and is not encrypted at rest by this package.
- Avoid storing sensitive personal data in shared or untrusted environments.

## Future extensions

- Replace file storage with database/vector backends while preserving contracts.
- Add configurable retention (TTL, max entries, compaction).
- Add redaction/encryption hooks before persistence.
