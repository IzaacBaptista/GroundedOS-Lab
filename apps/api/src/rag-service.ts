import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { basename, extname } from "path";
import type { DocumentModality } from "@groundedos/core";
import { ingest } from "@groundedos/etl";
import {
  buildRetrievalIndex,
  InMemoryVectorStore,
  LocalHashEmbeddingsProvider,
  OllamaEmbeddingsProvider,
  retrieveForDevMode,
  semanticToEmbeddingProvider,
  type EmbeddingModelInfo,
  type EmbeddingProvider,
  type EmbeddingProviderId,
  type EmbeddingVector,
  type RetrievalIndex,
  type RetrievalDevModeOutput,
} from "@groundedos/rag";
import { ApiRequestError } from "./errors";
import {
  deleteRagIndex,
  listRagIndexes,
  loadRagIndex,
  saveRagIndex,
  type PersistedRagIndexListItem,
} from "./rag-index-store";

const DEFAULT_TOP_K = 3;
const EMBEDDING_DIMENSIONS = 64;
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_EMBEDDING_MODEL = "embeddinggemma";
const DEFAULT_OLLAMA_EMBEDDING_DIMENSIONS = 768;

export { ApiRequestError } from "./errors";

type SupportedApiModality = Extract<DocumentModality, "text" | "pdf">;
type ApiEmbeddingProviderId = Extract<
  EmbeddingProviderId,
  "api-lexical" | "local-hash" | "ollama"
>;

const DEFAULT_API_EMBEDDING_PROVIDER: ApiEmbeddingProviderId = "api-lexical";
const API_LEXICAL_MODEL_INFO: EmbeddingModelInfo = {
  provider: "api-lexical",
  model: "api-lexical-v1",
  dimensions: EMBEDDING_DIMENSIONS,
  normalized: true,
};

export type RagAskRequest = {
  type?: DocumentModality;
  content?: string;
  query?: string;
  topK?: number;
  title?: string;
  documentId?: string;
  metadata?: Record<string, unknown>;
  indexDir?: string;
  embeddingProvider?: ApiEmbeddingProviderId;
};

export type RagAskFileRequest = {
  type?: SupportedApiModality;
  filePath?: string;
  originalFilename?: string;
  query?: string;
  topK?: number;
  title?: string;
  documentId?: string;
  metadata?: Record<string, unknown>;
  indexDir?: string;
  embeddingProvider?: ApiEmbeddingProviderId;
};

export type RagIndexRequest = {
  type?: DocumentModality;
  content?: string;
  title?: string;
  documentId?: string;
  metadata?: Record<string, unknown>;
  indexDir?: string;
  embeddingProvider?: ApiEmbeddingProviderId;
};

export type RagIndexFileRequest = {
  type?: SupportedApiModality;
  filePath?: string;
  originalFilename?: string;
  title?: string;
  documentId?: string;
  metadata?: Record<string, unknown>;
  indexDir?: string;
  embeddingProvider?: ApiEmbeddingProviderId;
};

export type RagDocumentSummary = {
  documentId: string;
  title: string;
  modality: SupportedApiModality;
  checksum: string;
  originalFilename?: string;
};

export type RagIndexSummary = {
  chunkCount: number;
  embeddingProvider: string;
  embeddingDimensions: number;
  embeddingModel?: EmbeddingModelInfo;
};

export type RagAskResponse = {
  document: RagDocumentSummary;
  query: string;
  answer: GroundedAnswer;
  index: RagIndexSummary;
  storage?: {
    persisted: boolean;
    indexPath?: string;
  };
  devMode: RetrievalDevModeOutput;
};

export type RagIndexResponse = {
  document: RagDocumentSummary;
  index: RagIndexSummary;
  storage: {
    persisted: true;
    indexPath: string;
  };
};

export type RagIndexListResponse = {
  count: number;
  indexes: PersistedRagIndexListItem[];
};

export type RagIndexDeleteResponse = {
  deleted: true;
  index: PersistedRagIndexListItem;
};

export type GroundedAnswer = {
  grounded: boolean;
  text: string;
  citations: Array<{
    chunkId: string;
    documentId: string;
    sectionId: string;
    score: number;
    source: RetrievalDevModeOutput["results"][number]["source"];
    offsets: RetrievalDevModeOutput["results"][number]["offsets"];
  }>;
};

class ApiLexicalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "api-lexical";
  readonly dimensions = EMBEDDING_DIMENSIONS;
  readonly modelInfo = API_LEXICAL_MODEL_INFO;

  async embedTexts(texts: string[]): Promise<EmbeddingVector[]> {
    return texts.map((text) => this.embedText(text));
  }

  private embedText(text: string): EmbeddingVector {
    const vector = Array.from({ length: this.dimensions }, () => 0);

    for (const token of tokenize(text)) {
      vector[hashToken(token) % this.dimensions] += 1;
    }

    const magnitude = Math.sqrt(
      vector.reduce((sum, value) => sum + value * value, 0)
    );

    if (magnitude === 0) {
      return vector;
    }

    return vector.map((value) => Number((value / magnitude).toFixed(12)));
  }
}

export async function askRag(request: RagAskRequest): Promise<RagAskResponse> {
  if (!request || typeof request !== "object") {
    throw new ApiRequestError("Request body must be a JSON object.");
  }

  if (request.content === undefined) {
    return await askPersistedRag(request);
  }

  const normalizedRequest = normalizeRequest(request);
  const checksum = createHash("sha256")
    .update(normalizedRequest.content)
    .digest("hex");
  const documentId = normalizedRequest.documentId ?? `api-${checksum.slice(0, 16)}`;
  const title = normalizedRequest.title ?? "Inline text";
  const document = await ingest({
    type: "text",
    content: normalizedRequest.content,
    metadata: {
      ...(normalizedRequest.metadata ?? {}),
      documentId,
      title,
      checksum,
    },
  });
  const ragOutput = await runLocalRag(
    document,
    normalizedRequest.query,
    normalizedRequest.topK,
    normalizedRequest.embeddingProvider
  );

  return {
    document: {
      documentId,
      title,
      modality: "text",
      checksum,
    },
    query: normalizedRequest.query,
    ...ragOutput,
  };
}

export async function askRagFromFile(
  request: RagAskFileRequest
): Promise<RagAskResponse> {
  const normalizedRequest = normalizeFileRequest(request);
  const rawBytes = await readFile(normalizedRequest.filePath);
  const checksum = createHash("sha256").update(rawBytes).digest("hex");
  const documentId = normalizedRequest.documentId ?? `upload-${checksum.slice(0, 16)}`;
  const title =
    normalizedRequest.title ??
    normalizedRequest.originalFilename ??
    basename(normalizedRequest.filePath);
  const document = await ingest({
    type: normalizedRequest.type,
    filePath: normalizedRequest.filePath,
    metadata: {
      ...(normalizedRequest.metadata ?? {}),
      documentId,
      title,
      checksum,
      originalFilename: normalizedRequest.originalFilename,
    },
  });
  const ragOutput = await runLocalRag(
    document,
    normalizedRequest.query,
    normalizedRequest.topK,
    normalizedRequest.embeddingProvider
  );

  return {
    document: {
      documentId,
      title,
      modality: normalizedRequest.type,
      checksum,
      originalFilename: normalizedRequest.originalFilename,
    },
    query: normalizedRequest.query,
    ...ragOutput,
  };
}

export async function indexRag(request: RagIndexRequest): Promise<RagIndexResponse> {
  const normalizedRequest = normalizeIndexRequest(request);
  const checksum = createHash("sha256")
    .update(normalizedRequest.content)
    .digest("hex");
  const documentId = normalizedRequest.documentId ?? `api-${checksum.slice(0, 16)}`;
  const title = normalizedRequest.title ?? "Inline text";
  const document = await ingest({
    type: "text",
    content: normalizedRequest.content,
    metadata: {
      ...(normalizedRequest.metadata ?? {}),
      documentId,
      title,
      checksum,
    },
  });
  const provider = createApiEmbeddingProvider(normalizedRequest.embeddingProvider);
  const index = await buildRetrievalIndex(document, {
    embeddingProvider: provider,
  });
  const documentSummary: RagDocumentSummary = {
    documentId,
    title,
    modality: "text",
    checksum,
  };
  const indexSummary = createIndexSummary(index);
  const saved = await saveRagIndex(
    {
      document: documentSummary,
      index: indexSummary,
      embeddedChunks: index.embeddedChunks,
    },
    normalizedRequest.indexDir
  );

  return {
    document: documentSummary,
    index: indexSummary,
    storage: {
      persisted: true,
      indexPath: saved.relativeIndexPath,
    },
  };
}

export async function indexRagFromFile(
  request: RagIndexFileRequest
): Promise<RagIndexResponse> {
  const normalizedRequest = normalizeIndexFileRequest(request);
  const rawBytes = await readFile(normalizedRequest.filePath);
  const checksum = createHash("sha256").update(rawBytes).digest("hex");
  const documentId = normalizedRequest.documentId ?? `upload-${checksum.slice(0, 16)}`;
  const title =
    normalizedRequest.title ??
    normalizedRequest.originalFilename ??
    basename(normalizedRequest.filePath);
  const document = await ingest({
    type: normalizedRequest.type,
    filePath: normalizedRequest.filePath,
    metadata: {
      ...(normalizedRequest.metadata ?? {}),
      documentId,
      title,
      checksum,
      originalFilename: normalizedRequest.originalFilename,
    },
  });
  const provider = createApiEmbeddingProvider(normalizedRequest.embeddingProvider);
  const index = await buildRetrievalIndex(document, {
    embeddingProvider: provider,
  });
  const documentSummary: RagDocumentSummary = {
    documentId,
    title,
    modality: normalizedRequest.type,
    checksum,
    originalFilename: normalizedRequest.originalFilename,
  };
  const indexSummary = createIndexSummary(index);
  const saved = await saveRagIndex(
    {
      document: documentSummary,
      index: indexSummary,
      embeddedChunks: index.embeddedChunks,
    },
    normalizedRequest.indexDir
  );

  return {
    document: documentSummary,
    index: indexSummary,
    storage: {
      persisted: true,
      indexPath: saved.relativeIndexPath,
    },
  };
}

export async function askPersistedRag(
  request: Pick<RagAskRequest, "documentId" | "query" | "topK" | "indexDir">
): Promise<RagAskResponse> {
  const normalizedRequest = normalizePersistedAskRequest(request);
  const saved = await loadRagIndex(normalizedRequest.documentId, normalizedRequest.indexDir);
  const provider = createApiEmbeddingProviderFromIndex(
    saved.record.index,
    normalizedRequest.documentId
  );

  const store = new InMemoryVectorStore();
  store.insert(saved.record.embeddedChunks);

  const ragOutput = await runPersistedRag(
    {
      embeddingProvider: provider,
      store,
      embeddedChunks: saved.record.embeddedChunks,
    },
    normalizedRequest.query,
    normalizedRequest.topK
  );

  return {
    document: saved.record.document,
    query: normalizedRequest.query,
    storage: {
      persisted: true,
      indexPath: saved.relativeIndexPath,
    },
    ...ragOutput,
  };
}

export async function listPersistedRagIndexes(indexDir?: string): Promise<RagIndexListResponse> {
  const indexes = await listRagIndexes(indexDir);

  return {
    count: indexes.length,
    indexes,
  };
}

export async function deletePersistedRagIndex(
  documentId: string,
  indexDir?: string
): Promise<RagIndexDeleteResponse> {
  if (typeof documentId !== "string" || documentId.trim().length === 0) {
    throw new ApiRequestError("documentId must be a non-empty string.");
  }

  const index = await deleteRagIndex(documentId.trim(), indexDir);

  return {
    deleted: true,
    index,
  };
}

function normalizeRequest(request: RagAskRequest): Required<
  Pick<RagAskRequest, "content" | "query" | "topK" | "embeddingProvider">
> &
  Pick<RagAskRequest, "title" | "documentId" | "metadata"> {
  if (!request || typeof request !== "object") {
    throw new ApiRequestError("Request body must be a JSON object.");
  }

  const type = request.type ?? "text";

  if (type !== "text") {
    throw new ApiRequestError(
      'JSON API currently supports only type "text". Use multipart/form-data for text or PDF file uploads.'
    );
  }

  if (typeof request.content !== "string" || request.content.trim().length === 0) {
    throw new ApiRequestError("content must be a non-empty string.");
  }

  if (typeof request.query !== "string" || request.query.trim().length === 0) {
    throw new ApiRequestError("query must be a non-empty string.");
  }

  const topK = request.topK ?? DEFAULT_TOP_K;

  if (!Number.isInteger(topK) || topK <= 0) {
    throw new ApiRequestError("topK must be a positive integer.");
  }

  if (request.title !== undefined && typeof request.title !== "string") {
    throw new ApiRequestError("title must be a string when provided.");
  }

  if (request.documentId !== undefined && typeof request.documentId !== "string") {
    throw new ApiRequestError("documentId must be a string when provided.");
  }

  if (
    request.metadata !== undefined &&
    (!request.metadata || typeof request.metadata !== "object" || Array.isArray(request.metadata))
  ) {
    throw new ApiRequestError("metadata must be an object when provided.");
  }

  return {
    content: request.content,
    query: request.query.trim(),
    topK,
    embeddingProvider: normalizeEmbeddingProvider(request.embeddingProvider),
    title: request.title,
    documentId: request.documentId,
    metadata: request.metadata,
  };
}

function normalizeIndexRequest(request: RagIndexRequest): Required<
  Pick<RagIndexRequest, "content" | "embeddingProvider">
> &
  Pick<RagIndexRequest, "title" | "documentId" | "metadata" | "indexDir"> {
  if (!request || typeof request !== "object") {
    throw new ApiRequestError("Request body must be a JSON object.");
  }

  const type = request.type ?? "text";

  if (type !== "text") {
    throw new ApiRequestError(
      'JSON index API currently supports only type "text". Use multipart/form-data for text or PDF file uploads.'
    );
  }

  if (typeof request.content !== "string" || request.content.trim().length === 0) {
    throw new ApiRequestError("content must be a non-empty string.");
  }

  validateOptionalString(request.title, "title");
  validateOptionalString(request.documentId, "documentId");
  validateOptionalMetadata(request.metadata);

  return {
    content: request.content,
    embeddingProvider: normalizeEmbeddingProvider(request.embeddingProvider),
    title: request.title,
    documentId: request.documentId,
    metadata: request.metadata,
    indexDir: request.indexDir,
  };
}

function normalizeFileRequest(request: RagAskFileRequest): Required<
  Pick<RagAskFileRequest, "filePath" | "query" | "topK" | "type" | "embeddingProvider">
> &
  Pick<RagAskFileRequest, "title" | "documentId" | "metadata" | "originalFilename"> {
  if (!request || typeof request !== "object") {
    throw new ApiRequestError("Multipart request data must be provided.");
  }

  if (typeof request.filePath !== "string" || request.filePath.trim().length === 0) {
    throw new ApiRequestError("file upload is required.");
  }

  const type = request.type ?? inferModality(request.originalFilename ?? request.filePath);

  if (type !== "text" && type !== "pdf") {
    throw new ApiRequestError('type must be "text" or "pdf" for file uploads.');
  }

  if (typeof request.query !== "string" || request.query.trim().length === 0) {
    throw new ApiRequestError("query must be a non-empty string.");
  }

  const topK = request.topK ?? DEFAULT_TOP_K;

  if (!Number.isInteger(topK) || topK <= 0) {
    throw new ApiRequestError("topK must be a positive integer.");
  }

  if (request.title !== undefined && typeof request.title !== "string") {
    throw new ApiRequestError("title must be a string when provided.");
  }

  if (request.documentId !== undefined && typeof request.documentId !== "string") {
    throw new ApiRequestError("documentId must be a string when provided.");
  }

  if (
    request.metadata !== undefined &&
    (!request.metadata || typeof request.metadata !== "object" || Array.isArray(request.metadata))
  ) {
    throw new ApiRequestError("metadata must be an object when provided.");
  }

  return {
    filePath: request.filePath,
    query: request.query.trim(),
    topK,
    type,
    embeddingProvider: normalizeEmbeddingProvider(request.embeddingProvider),
    title: request.title,
    documentId: request.documentId,
    metadata: request.metadata,
    originalFilename: request.originalFilename,
  };
}

function normalizeIndexFileRequest(request: RagIndexFileRequest): Required<
  Pick<RagIndexFileRequest, "filePath" | "type" | "embeddingProvider">
> &
  Pick<RagIndexFileRequest, "title" | "documentId" | "metadata" | "originalFilename" | "indexDir"> {
  if (!request || typeof request !== "object") {
    throw new ApiRequestError("Multipart request data must be provided.");
  }

  if (typeof request.filePath !== "string" || request.filePath.trim().length === 0) {
    throw new ApiRequestError("file upload is required.");
  }

  const type = request.type ?? inferModality(request.originalFilename ?? request.filePath);

  if (type !== "text" && type !== "pdf") {
    throw new ApiRequestError('type must be "text" or "pdf" for file uploads.');
  }

  validateOptionalString(request.title, "title");
  validateOptionalString(request.documentId, "documentId");
  validateOptionalMetadata(request.metadata);

  return {
    filePath: request.filePath,
    type,
    embeddingProvider: normalizeEmbeddingProvider(request.embeddingProvider),
    title: request.title,
    documentId: request.documentId,
    metadata: request.metadata,
    originalFilename: request.originalFilename,
    indexDir: request.indexDir,
  };
}

function normalizePersistedAskRequest(
  request: Pick<RagAskRequest, "documentId" | "query" | "topK" | "indexDir">
): Required<Pick<RagAskRequest, "documentId" | "query" | "topK">> &
  Pick<RagAskRequest, "indexDir"> {
  if (!request || typeof request !== "object") {
    throw new ApiRequestError("Request body must be a JSON object.");
  }

  if (typeof request.documentId !== "string" || request.documentId.trim().length === 0) {
    throw new ApiRequestError("documentId must be a non-empty string.");
  }

  if (typeof request.query !== "string" || request.query.trim().length === 0) {
    throw new ApiRequestError("query must be a non-empty string.");
  }

  const topK = request.topK ?? DEFAULT_TOP_K;

  if (!Number.isInteger(topK) || topK <= 0) {
    throw new ApiRequestError("topK must be a positive integer.");
  }

  return {
    documentId: request.documentId.trim(),
    query: request.query.trim(),
    topK,
    indexDir: request.indexDir,
  };
}

async function runLocalRag(
  document: Awaited<ReturnType<typeof ingest>>,
  query: string,
  topK: number,
  embeddingProviderId: ApiEmbeddingProviderId
): Promise<Pick<RagAskResponse, "answer" | "index" | "devMode">> {
  const provider = createApiEmbeddingProvider(embeddingProviderId);
  const index = await buildRetrievalIndex(document, {
    embeddingProvider: provider,
  });
  const devMode = await retrieveForDevMode(index, query, {
    topK,
  });

  return {
    answer: createGroundedAnswer(devMode),
    index: createIndexSummary(index),
    devMode,
  };
}

async function runPersistedRag(
  index: RetrievalIndex,
  query: string,
  topK: number
): Promise<Pick<RagAskResponse, "answer" | "index" | "devMode">> {
  const devMode = await retrieveForDevMode(index, query, {
    topK,
  });

  return {
    answer: createGroundedAnswer(devMode),
    index: createIndexSummary(index),
    devMode,
  };
}

function createIndexSummary(index: RetrievalIndex): RagIndexSummary {
  return {
    chunkCount: index.embeddedChunks.length,
    embeddingProvider: index.embeddingProvider.name,
    embeddingDimensions: index.embeddingProvider.dimensions,
    embeddingModel: index.embeddingProvider.modelInfo,
  };
}

function createApiEmbeddingProvider(
  providerId: ApiEmbeddingProviderId,
  modelInfo?: EmbeddingModelInfo
): EmbeddingProvider {
  switch (providerId) {
    case "api-lexical":
      return new ApiLexicalEmbeddingProvider();
    case "local-hash":
      return semanticToEmbeddingProvider(new LocalHashEmbeddingsProvider());
    case "ollama":
      return semanticToEmbeddingProvider(createOllamaEmbeddingsProvider(modelInfo));
  }
}

function createApiEmbeddingProviderFromIndex(
  index: RagIndexSummary,
  documentId: string
): EmbeddingProvider {
  const providerId = parseStoredEmbeddingProvider(index.embeddingProvider, documentId);
  const provider = createApiEmbeddingProvider(providerId, index.embeddingModel);

  if (index.embeddingDimensions !== provider.dimensions) {
    throw new ApiRequestError(
      `Persisted RAG index "${documentId}" uses ${index.embeddingDimensions} dimensions for provider "${index.embeddingProvider}", but this runtime expects ${provider.dimensions}.`,
      500
    );
  }

  return provider;
}

function normalizeEmbeddingProvider(
  providerId: ApiEmbeddingProviderId | undefined
): ApiEmbeddingProviderId {
  if (providerId === undefined) {
    return DEFAULT_API_EMBEDDING_PROVIDER;
  }

  if (providerId === "api-lexical" || providerId === "local-hash" || providerId === "ollama") {
    return providerId;
  }

  throw new ApiRequestError('embeddingProvider must be "api-lexical", "local-hash" or "ollama".');
}

function parseStoredEmbeddingProvider(
  providerId: string,
  documentId: string
): ApiEmbeddingProviderId {
  if (providerId === "api-lexical" || providerId === "local-hash" || providerId === "ollama") {
    return providerId;
  }

  throw new ApiRequestError(
    `Persisted RAG index "${documentId}" uses unsupported embedding provider "${providerId}".`,
    500
  );
}

function createOllamaEmbeddingsProvider(modelInfo?: EmbeddingModelInfo): OllamaEmbeddingsProvider {
  return new OllamaEmbeddingsProvider({
    baseUrl: process.env.GROUNDEDOS_OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL,
    model:
      modelInfo?.model ??
      process.env.GROUNDEDOS_OLLAMA_EMBED_MODEL ??
      DEFAULT_OLLAMA_EMBEDDING_MODEL,
    dimensions:
      modelInfo?.dimensions ??
      parseOptionalPositiveInteger(
        process.env.GROUNDEDOS_OLLAMA_EMBED_DIMENSIONS,
        "GROUNDEDOS_OLLAMA_EMBED_DIMENSIONS"
      ) ??
      DEFAULT_OLLAMA_EMBEDDING_DIMENSIONS,
    keepAlive: process.env.GROUNDEDOS_OLLAMA_KEEP_ALIVE,
    requestTimeoutMs:
      parseOptionalPositiveInteger(
        process.env.GROUNDEDOS_OLLAMA_REQUEST_TIMEOUT_MS,
        "GROUNDEDOS_OLLAMA_REQUEST_TIMEOUT_MS"
      ) ?? undefined,
  });
}

function parseOptionalPositiveInteger(
  value: string | undefined,
  name: string
): number | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiRequestError(`${name} must be a positive integer.`, 500);
  }

  return parsed;
}

function validateOptionalString(value: string | undefined, fieldName: string): void {
  if (value !== undefined && typeof value !== "string") {
    throw new ApiRequestError(`${fieldName} must be a string when provided.`);
  }
}

function validateOptionalMetadata(metadata: Record<string, unknown> | undefined): void {
  if (
    metadata !== undefined &&
    (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
  ) {
    throw new ApiRequestError("metadata must be an object when provided.");
  }
}

function inferModality(filePath: string): SupportedApiModality {
  if (extname(filePath).toLowerCase() === ".pdf") {
    return "pdf";
  }

  return "text";
}

function createGroundedAnswer(devMode: RetrievalDevModeOutput): GroundedAnswer {
  const topResult = devMode.results[0];

  if (!topResult) {
    return {
      grounded: false,
      text: "No retrieved chunk was available for this query.",
      citations: [],
    };
  }

  return {
    grounded: true,
    text: `Based on the top retrieved chunk: ${topResult.text}`,
    citations: [
      {
        chunkId: topResult.chunkId,
        documentId: topResult.documentId,
        sectionId: topResult.sectionId,
        score: topResult.score,
        source: topResult.source,
        offsets: topResult.offsets,
      },
    ],
  };
}

function tokenize(text: string): string[] {
  return (text.normalize("NFKC").toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .map(stemToken)
    .filter((token) => token.length > 0);
}

function stemToken(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.length > 4 && token.endsWith("es")) {
    return token.slice(0, -2);
  }

  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }

  return token;
}

function hashToken(token: string): number {
  let hash = 0;

  for (let index = 0; index < token.length; index += 1) {
    hash = (hash * 31 + token.charCodeAt(index)) >>> 0;
  }

  return hash;
}
