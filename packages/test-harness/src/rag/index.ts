import type { NormalizedDocument, SourceDocument } from "@groundedos/core";
import { ingest } from "@groundedos/etl";
import {
  buildRetrievalIndex,
  DeterministicEmbeddingProvider,
  retrieveFromIndex,
  type BuildRetrievalIndexOptions,
  type EmbeddingProvider,
  type EmbeddingVector,
  type RetrievalIndex,
  type RetrievalMode,
  type RetrievalResult,
} from "@groundedos/rag";
import { resetRagRuntimeState as resetApiRagRuntimeState } from "../../../../apps/api/src/testing/rag-test-utils";

export class KeywordEmbeddingProvider implements EmbeddingProvider {
  readonly name = "keyword-test-provider";
  readonly dimensions = 3;

  async embedTexts(texts: string[]): Promise<EmbeddingVector[]> {
    return texts.map((text) => {
      const normalized = text.toLowerCase();
      return [
        normalized.includes("alpha") ? 1 : 0,
        normalized.includes("beta") ? 1 : 0,
        normalized.includes("gamma") ? 1 : 0,
      ];
    });
  }
}

export interface RagTestCase {
  type: "text";
  content: string;
  query: string;
  title: string;
  documentId: string;
  topK: number;
}

export interface MakeRagTestCaseOptions {
  content?: string;
  query?: string;
  title?: string;
  documentId?: string;
  topK?: number;
}

export function makeRagTestCase(options: MakeRagTestCaseOptions = {}): RagTestCase {
  return {
    type: "text",
    content: options.content ?? "Alpha setup notes.\n\nBeta retrieval notes explain vector search.",
    query: options.query ?? "What explains vector search?",
    title: options.title ?? "RAG Harness Test",
    documentId: options.documentId ?? "rag-test-doc",
    topK: options.topK ?? 1,
  };
}

export interface MakeTestDocumentOptions {
  metadata?: Record<string, unknown>;
  documentId?: string;
  title?: string;
}

export interface TestDocumentBundle {
  source: SourceDocument;
  normalized: NormalizedDocument;
}

export async function makeTestDocument(
  content: string,
  options: MakeTestDocumentOptions = {}
): Promise<TestDocumentBundle> {
  const normalized = await ingest({
    type: "text",
    content,
    metadata: {
      documentId: options.documentId ?? "test-document",
      title: options.title ?? "Test Document",
      ...(options.metadata ?? {}),
    },
  });

  return {
    source: {
      id: normalized.documentId,
      title: normalized.title,
      modality: normalized.modality,
      mimeType: normalized.lineage.mimeType,
      source:
        normalized.lineage.sourceType === "url"
          ? { type: "url", uri: "about:blank" }
          : { type: normalized.lineage.sourceType },
      metadata: {
        checksum: normalized.lineage.checksum,
      },
      status: "processed",
      createdAt: normalized.lineage.extractedAt,
      updatedAt: normalized.lineage.extractedAt,
      originalFilename: normalized.lineage.originalFilename,
      language: normalized.language,
    },
    normalized,
  };
}

export interface BuildTestIndexOptions extends Omit<BuildRetrievalIndexOptions, "embeddingProvider"> {
  metadata?: Record<string, unknown>;
  embeddingProvider?: EmbeddingProvider;
  retrievalMode?: RetrievalMode;
}

export interface BuiltTestIndex {
  document: NormalizedDocument;
  sourceDocument: SourceDocument;
  index: RetrievalIndex;
  retrieve(query: string, topK?: number): Promise<RetrievalResult[]>;
}

export async function buildTestIndex(
  content: string,
  options: BuildTestIndexOptions = {}
): Promise<BuiltTestIndex> {
  const { source, normalized } = await makeTestDocument(content, { metadata: options.metadata });
  const index = await buildRetrievalIndex(normalized, {
    ...options,
    embeddingProvider: options.embeddingProvider ?? new DeterministicEmbeddingProvider(),
  });

  return {
    document: normalized,
    sourceDocument: source,
    index,
    retrieve: async (query: string, topK = 3) =>
      await retrieveFromIndex(index, query, {
        topK,
        mode: options.retrievalMode ?? "dense",
      }),
  };
}

export async function resetRagRuntimeState(): Promise<void> {
  await resetApiRagRuntimeState();
}

export { DeterministicEmbeddingProvider };
