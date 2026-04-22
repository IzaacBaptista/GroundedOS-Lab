import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { basename, extname } from "path";
import type { DocumentModality } from "@groundedos/core";
import { ingest } from "@groundedos/etl";
import {
  buildRetrievalIndex,
  retrieveForDevMode,
  type EmbeddingProvider,
  type EmbeddingVector,
  type RetrievalDevModeOutput,
} from "@groundedos/rag";

const DEFAULT_TOP_K = 3;
const EMBEDDING_DIMENSIONS = 64;

type SupportedApiModality = Extract<DocumentModality, "text" | "pdf">;

export type RagAskRequest = {
  type?: DocumentModality;
  content?: string;
  query?: string;
  topK?: number;
  title?: string;
  documentId?: string;
  metadata?: Record<string, unknown>;
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
};

export type RagAskResponse = {
  document: {
    documentId: string;
    title: string;
    modality: SupportedApiModality;
    checksum: string;
    originalFilename?: string;
  };
  query: string;
  answer: GroundedAnswer;
  index: {
    chunkCount: number;
    embeddingProvider: string;
    embeddingDimensions: number;
  };
  devMode: RetrievalDevModeOutput;
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

export class ApiRequestError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ApiRequestError";
    this.statusCode = statusCode;
  }
}

class ApiLexicalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "api-lexical";
  readonly dimensions = EMBEDDING_DIMENSIONS;

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
  const ragOutput = await runLocalRag(document, normalizedRequest.query, normalizedRequest.topK);

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
  const ragOutput = await runLocalRag(document, normalizedRequest.query, normalizedRequest.topK);

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

function normalizeRequest(request: RagAskRequest): Required<
  Pick<RagAskRequest, "content" | "query" | "topK">
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
    title: request.title,
    documentId: request.documentId,
    metadata: request.metadata,
  };
}

function normalizeFileRequest(request: RagAskFileRequest): Required<
  Pick<RagAskFileRequest, "filePath" | "query" | "topK" | "type">
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
    title: request.title,
    documentId: request.documentId,
    metadata: request.metadata,
    originalFilename: request.originalFilename,
  };
}

async function runLocalRag(
  document: Awaited<ReturnType<typeof ingest>>,
  query: string,
  topK: number
): Promise<Pick<RagAskResponse, "answer" | "index" | "devMode">> {
  const index = await buildRetrievalIndex(document, {
    embeddingProvider: new ApiLexicalEmbeddingProvider(),
  });
  const devMode = await retrieveForDevMode(index, query, {
    topK,
  });

  return {
    answer: createGroundedAnswer(devMode),
    index: {
      chunkCount: index.embeddedChunks.length,
      embeddingProvider: index.embeddingProvider.name,
      embeddingDimensions: index.embeddingProvider.dimensions,
    },
    devMode,
  };
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
