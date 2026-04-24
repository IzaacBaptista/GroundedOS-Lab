import type {
  ApiErrorBody,
  EmbeddingMapResponse,
  EmbeddingProviderId,
  FileType,
  RagAskResponse,
  RagIndexDeleteResponse,
  RagIndexListResponse,
  RagIndexResponse,
  TradeoffMetricsResponse,
} from "./types";

const API_PREFIX = "/api";

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => undefined)) as
    | (T & ApiErrorBody)
    | undefined;

  if (!response.ok) {
    const message =
      body?.error?.message ?? `Request failed with status ${response.status}.`;
    throw new Error(message);
  }

  if (body === undefined) {
    throw new Error("API response body was not JSON.");
  }

  return body;
}

export async function checkHealth(): Promise<void> {
  const response = await fetch(`${API_PREFIX}/health`);

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}.`);
  }
}

export async function listIndexes(): Promise<RagIndexListResponse> {
  const response = await fetch(`${API_PREFIX}/rag/indexes`);
  return parseResponse<RagIndexListResponse>(response);
}

export async function deleteIndex(
  documentId: string
): Promise<RagIndexDeleteResponse> {
  const response = await fetch(
    `${API_PREFIX}/rag/indexes/${encodeURIComponent(documentId)}`,
    { method: "DELETE" }
  );
  return parseResponse<RagIndexDeleteResponse>(response);
}

export async function getEmbeddingMap(
  documentId: string
): Promise<EmbeddingMapResponse> {
  const response = await fetch(
    `${API_PREFIX}/rag/indexes/${encodeURIComponent(documentId)}/embedding-map`
  );
  return parseResponse<EmbeddingMapResponse>(response);
}

export async function getTradeoffMetrics(): Promise<TradeoffMetricsResponse> {
  const response = await fetch(`${API_PREFIX}/rag/metrics/tradeoffs`);
  return parseResponse<TradeoffMetricsResponse>(response);
}

export interface AskTextParams {
  content: string;
  query: string;
  topK: number;
  embeddingProvider: EmbeddingProviderId;
  sessionId?: string;
  title?: string;
}

export async function askWithText(
  params: AskTextParams
): Promise<RagAskResponse> {
  const response = await fetch(`${API_PREFIX}/rag/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "text",
      content: params.content,
      query: params.query,
      topK: params.topK,
      embeddingProvider: params.embeddingProvider,
      sessionId: params.sessionId || undefined,
      title: params.title || undefined,
    }),
  });
  return parseResponse<RagAskResponse>(response);
}

export interface AskFileParams {
  file: File;
  fileType: FileType;
  query: string;
  topK: number;
  embeddingProvider: EmbeddingProviderId;
  sessionId?: string;
  title?: string;
}

export async function askWithFile(
  params: AskFileParams
): Promise<RagAskResponse> {
  const form = new FormData();

  form.append("file", params.file);
  form.append("type", params.fileType);
  form.append("query", params.query);
  form.append("topK", String(params.topK));
  form.append("embeddingProvider", params.embeddingProvider);

  if (params.sessionId) {
    form.append("sessionId", params.sessionId);
  }

  if (params.title) {
    form.append("title", params.title);
  }

  const response = await fetch(`${API_PREFIX}/rag/ask`, {
    method: "POST",
    body: form,
  });
  return parseResponse<RagAskResponse>(response);
}

export interface AskPersistedParams {
  documentId: string;
  query: string;
  topK: number;
  sessionId?: string;
}

export async function askWithPersisted(
  params: AskPersistedParams
): Promise<RagAskResponse> {
  const response = await fetch(`${API_PREFIX}/rag/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  return parseResponse<RagAskResponse>(response);
}

export interface IndexTextParams {
  content: string;
  embeddingProvider: EmbeddingProviderId;
  title?: string;
}

export async function indexText(
  params: IndexTextParams
): Promise<RagIndexResponse> {
  const response = await fetch(`${API_PREFIX}/rag/index`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "text",
      content: params.content,
      embeddingProvider: params.embeddingProvider,
      title: params.title || undefined,
    }),
  });
  return parseResponse<RagIndexResponse>(response);
}

export interface IndexFileParams {
  file: File;
  fileType: FileType;
  embeddingProvider: EmbeddingProviderId;
  title?: string;
}

export async function indexFile(
  params: IndexFileParams
): Promise<RagIndexResponse> {
  const form = new FormData();

  form.append("file", params.file);
  form.append("type", params.fileType);
  form.append("embeddingProvider", params.embeddingProvider);

  if (params.title) {
    form.append("title", params.title);
  }

  const response = await fetch(`${API_PREFIX}/rag/index`, {
    method: "POST",
    body: form,
  });
  return parseResponse<RagIndexResponse>(response);
}
