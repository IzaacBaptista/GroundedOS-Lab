/**
 * Book cap. 21 — contextual chunks. A chunk like "a receita cresceu 3%" is
 * useless for retrieval on its own — which company, which quarter? This
 * generates a short situating blurb per chunk (LLM call, using the whole
 * document as reference) at indexing time, and combines it with the
 * chunk's own text before embedding/BM25 — the book's "contextual
 * embeddings" — so retrieval on the entities/topic implicit in the chunk
 * actually works.
 */

import type { RetrievalChunk } from "./chunking";
import type { LlmTextProvider } from "./llm-text-provider";

const MAX_DOCUMENT_CHARS_FOR_CONTEXT = 8_000;

/**
 * Asks the LLM for a one-sentence situating blurb for `chunk` given the
 * full document it came from — the entities, section, or topic implicit
 * in the chunk but not stated in it.
 */
export async function buildChunkContext(
  chunk: RetrievalChunk,
  documentText: string,
  llmProvider: LlmTextProvider
): Promise<string> {
  const response = await llmProvider.complete({
    system:
      "You situate a short excerpt within its source document. Given the " +
      "full document and one excerpt from it, write ONE short sentence " +
      "identifying what the excerpt is about that isn't stated in the " +
      "excerpt itself (the company/entity, section, or topic it belongs " +
      "to). Return only that sentence, nothing else.",
    user:
      `Document:\n${documentText.slice(0, MAX_DOCUMENT_CHARS_FOR_CONTEXT)}\n\n` +
      `Excerpt:\n${chunk.text}`,
  });

  return response.trim();
}

/**
 * Generates and attaches `metadata.context` for every chunk, in parallel.
 * A chunk whose LLM call fails keeps `context` unset rather than failing
 * the whole batch — one bad call shouldn't block indexing the rest of the
 * document.
 */
export async function annotateChunksWithContext<T extends RetrievalChunk>(
  chunks: T[],
  documentText: string,
  llmProvider: LlmTextProvider
): Promise<T[]> {
  return Promise.all(
    chunks.map(async (chunk) => {
      try {
        const context = await buildChunkContext(chunk, documentText, llmProvider);
        return { ...chunk, metadata: { ...chunk.metadata, context } } as T;
      } catch (error) {
        console.warn(
          `[rag/contextual-chunking] failed to generate context for chunk "${chunk.id}"; leaving it unset.`,
          error
        );
        return chunk;
      }
    })
  );
}

/**
 * The text that should actually be embedded/BM25-indexed for a chunk:
 * context + chunk text when context was generated, otherwise just the
 * chunk text unchanged. Single source of truth so the dense and lexical
 * sides of hybrid search never drift apart on this.
 */
export function contextualizedChunkText(chunk: RetrievalChunk): string {
  return chunk.metadata.context ? `${chunk.metadata.context}\n\n${chunk.text}` : chunk.text;
}
