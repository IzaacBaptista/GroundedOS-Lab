import { Inject, Injectable } from "@nestjs/common";
import {
  askRag,
  askRagFromFile,
  indexRag,
  indexRagFromFile,
  type RagAskFileRequest,
  type RagAskRequest,
  type RagAskResponse,
  type RagIndexFileRequest,
  type RagIndexRequest,
  type RagIndexResponse,
} from "../rag-service";
import { ApiConfigService } from "../config/api-config";
import { getActiveTraceContext } from "../otel";
import { createRagErrorTrace, createRagSuccessTrace } from "../observability/trace-builders";
import { TraceStore } from "../observability/trace-store";

/**
 * Thin injectable wrapper around the stateless RAG service functions. Keeping
 * the business logic in {@link ../rag-service.ts} preserves the existing input
 * validation rules (and their exact error messages) that the public API
 * contract — and the integration tests — depend on.
 */
@Injectable()
export class RagService {
  private readonly traceStore = new TraceStore();

  constructor(@Inject(ApiConfigService) private readonly config: ApiConfigService) {}

  async ask(request: RagAskRequest): Promise<RagAskResponse> {
    const normalized = this.withIndexDir(request);
    const startedAt = Date.now();
    const activeTrace = getActiveTraceContext();

    try {
      const response = this.enrichDevMode(
        await askRag(normalized),
        {
          requestId: normalized.requestId,
          traceId: activeTrace?.traceId,
          sessionId: normalized.sessionId,
          tenantId: normalized.tenantId,
          userId: normalized.ownerId,
          indexId: normalized.documentId,
        }
      );
      await this.traceStore.append(
        createRagSuccessTrace({
          request: normalized,
          response,
          durationMs: Date.now() - startedAt,
          correlation: {
            requestId: normalized.requestId,
            traceId: activeTrace?.traceId,
            sessionId: normalized.sessionId,
            tenantId: normalized.tenantId,
            userId: normalized.ownerId,
            indexId: normalized.documentId ?? response.document.documentId,
          },
        })
      );
      return response;
    } catch (error) {
      await this.traceStore.append(
        createRagErrorTrace({
          request: normalized,
          durationMs: Date.now() - startedAt,
          correlation: {
            requestId: normalized.requestId,
            traceId: activeTrace?.traceId,
            sessionId: normalized.sessionId,
            tenantId: normalized.tenantId,
            userId: normalized.ownerId,
            indexId: normalized.documentId,
          },
          error,
        })
      );
      throw error;
    }
  }

  async askFromFile(request: RagAskFileRequest): Promise<RagAskResponse> {
    const withIndex = { ...request, indexDir: this.config.indexDir };
    const startedAt = Date.now();
    const activeTrace = getActiveTraceContext();

    try {
      const response = this.enrichDevMode(
        await askRagFromFile(withIndex),
        {
          requestId: withIndex.requestId,
          traceId: activeTrace?.traceId,
          sessionId: withIndex.sessionId,
          tenantId: withIndex.tenantId,
          userId: withIndex.ownerId,
          indexId: withIndex.documentId,
        }
      );
      await this.traceStore.append(
        createRagSuccessTrace({
          request: {
            ...withIndex,
            documentId: withIndex.documentId ?? response.document.documentId,
            query: withIndex.query,
          },
          response,
          durationMs: Date.now() - startedAt,
          correlation: {
            requestId: withIndex.requestId,
            traceId: activeTrace?.traceId,
            sessionId: withIndex.sessionId,
            tenantId: withIndex.tenantId,
            userId: withIndex.ownerId,
            indexId: withIndex.documentId ?? response.document.documentId,
          },
        })
      );
      return response;
    } catch (error) {
      await this.traceStore.append(
        createRagErrorTrace({
          request: {
            ...withIndex,
            query: withIndex.query,
            content: undefined,
          },
          durationMs: Date.now() - startedAt,
          correlation: {
            requestId: withIndex.requestId,
            traceId: activeTrace?.traceId,
            sessionId: withIndex.sessionId,
            tenantId: withIndex.tenantId,
            userId: withIndex.ownerId,
            indexId: withIndex.documentId,
          },
          error,
        })
      );
      throw error;
    }
  }

  index(request: RagIndexRequest): Promise<RagIndexResponse> {
    return indexRag(this.withIndexDir(request));
  }

  indexFromFile(request: RagIndexFileRequest): Promise<RagIndexResponse> {
    return indexRagFromFile({ ...request, indexDir: this.config.indexDir });
  }

  private withIndexDir<T extends { indexDir?: string }>(request: T): T {
    return {
      ...request,
      indexDir: this.config.indexDir,
    };
  }

  private enrichDevMode(response: RagAskResponse, correlation: Record<string, unknown>): RagAskResponse {
    const workflowSteps = response.devMode.workflowContext?.steps
      ? Object.entries(response.devMode.workflowContext.steps).map(([stage, detail]) => ({
          stage,
          status: detail.status,
          durationMs: detail.durationMs ?? 0,
        }))
      : [];

    (response.devMode as unknown as Record<string, unknown>).correlation = correlation;
    (response.devMode as unknown as Record<string, unknown>).executionChain = workflowSteps;
    return response;
  }
}
