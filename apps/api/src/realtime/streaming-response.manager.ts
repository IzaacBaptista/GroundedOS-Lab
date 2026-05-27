import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  AgentReActRequest,
  QueryStreamRequest,
  StreamEventResponse,
} from "@groundedos/core";
import type { FastifyReply } from "fastify";
import { AgentService } from "../agents/agent.service";
import { JobsService } from "../jobs/jobs.service";
import { RagService } from "../rag/rag.service";
import type { StreamEvent, StreamLifecycle } from "./realtime.types";
import { RealtimeGateway } from "./realtime.gateway";

interface StreamContext {
  requestId: string;
  ownerId?: string;
  tenantId?: string;
  apiKeyId?: string;
}

@Injectable()
export class StreamingResponseManager {
  constructor(
    private readonly rag: RagService,
    private readonly agents: AgentService,
    private readonly jobs: JobsService,
    private readonly gateway: RealtimeGateway
  ) {}

  async streamToSse(reply: FastifyReply, events: AsyncIterable<StreamEvent>): Promise<void> {
    reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");

    let closed = false;
    const heartbeat = setInterval(() => {
      if (!closed) {
        reply.raw.write(": heartbeat\n\n");
      }
    }, 15_000);

    reply.raw.on("close", () => {
      closed = true;
      clearInterval(heartbeat);
    });

    try {
      for await (const event of events) {
        if (closed) {
          return;
        }
        reply.raw.write(`event: ${event.type}\n`);
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } finally {
      clearInterval(heartbeat);
      if (!closed) {
        reply.raw.end();
      }
    }
  }

  async collect(events: AsyncIterable<StreamEvent>): Promise<StreamEventResponse> {
    const items: StreamEventResponse["events"] = [];
    for await (const event of events) {
      items.push(event);
    }
    return { events: items };
  }

  async *streamRagQuery(request: QueryStreamRequest, context: StreamContext): AsyncGenerator<StreamEvent> {
    const lifecycle = this.createLifecycle();
    let sequence = 0;

    const emit = (type: StreamEvent["type"], payload: Record<string, unknown>): StreamEvent => {
      sequence += 1;
      const event: StreamEvent = {
        type,
        sequence,
        timestamp: new Date().toISOString(),
        payload,
      };
      this.gateway.publisher.publish(`session:${request.sessionId ?? context.requestId}`, event);
      return event;
    };

    yield emit("retrieval_started", {
      lifecycle,
      query: request.query,
      vectorProvider: request.vectorProvider ?? "memory",
    });

    try {
      const response = await this.rag.ask({
        query: request.query,
        content: request.content,
        type: request.type,
        topK: request.topK,
        title: request.title,
        documentId: request.documentId,
        metadata: request.metadata,
        embeddingProvider: request.embeddingProvider,
        indexDir: request.indexDir,
        sessionId: request.sessionId,
        useMultiModelOrchestration: request.useMultiModelOrchestration,
        reasoningEnabled: request.reasoningEnabled,
        enableShadowRetrieval: request.enableShadowRetrieval,
        ownerId: context.ownerId,
        tenantId: context.tenantId,
        requestId: context.requestId,
        apiKeyId: context.apiKeyId,
      });

      const retrievalResults = response.devMode.results ?? [];
      const citations = response.answer.citations ?? [];

      yield emit("retrieval_completed", {
        candidateCount: retrievalResults.length,
        collection: response.document.documentId,
      });
      yield emit("reranking_completed", {
        returnedCount: retrievalResults.length,
      });
      yield emit("generation_started", {
        provider: response.devMode.routing?.selectedProvider,
      });

      let tokenIndex = 0;
      for (const token of tokenize(response.answer.text)) {
        if (request.includeCitations === false && token.startsWith("[")) {
          continue;
        }
        yield emit("token", {
          chunk: {
            text: token,
            index: tokenIndex,
          },
          partialAnswer: {
            text: response.answer.text.slice(0, Math.min(response.answer.text.length, tokenIndex + token.length + 1)),
            citations: [],
          },
        });
        tokenIndex += 1;
      }

      if (request.includeCitations !== false) {
        for (const citation of citations) {
          yield emit("citation", citation as unknown as Record<string, unknown>);
        }
      }

      if (request.includeReasoningSummary !== false) {
        const classification = response.devMode.adaptiveRoutingTrace?.classification;
        yield emit("reasoning_summary", {
          summary: classification
            ? `Adaptive routing classification: ${classification}.`
            : "Grounded retrieval and extractive synthesis completed.",
        });
      }

      lifecycle.status = "completed";
      lifecycle.completedAt = new Date().toISOString();
      const latencyMs = response.devMode.stageMetrics?.reduce(
        (total, metric) => total + metric.durationMs,
        0
      );
      const costUsd =
        response.devMode.cost?.totalCostUsd ?? response.devMode.costBreakdown?.totalUsd;
      yield emit("completed", {
        lifecycle,
        answer: response.answer,
        metrics: {
          latencyMs,
          costUsd,
        },
      });
    } catch (error) {
      lifecycle.status = "error";
      lifecycle.completedAt = new Date().toISOString();
      yield emit("error", {
        lifecycle,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async *streamAgentRun(request: AgentReActRequest, context: StreamContext): AsyncGenerator<StreamEvent> {
    let sequence = 0;
    const emit = (type: StreamEvent["type"], payload: Record<string, unknown>): StreamEvent => ({
      type,
      sequence: ++sequence,
      timestamp: new Date().toISOString(),
      payload,
    });

    yield emit("step_started", { step: "agent_init", query: request.query });
    const response = await this.agents.executeReAct(request, {
      requestId: context.requestId,
      sessionId: request.sessionId,
      tenantId: context.tenantId,
      userId: context.ownerId,
      indexId: request.indexId,
    });

    for (const step of response.devMode?.steps ?? []) {
      const type = step.type === "tool" ? "tool_call_started" : "observation";
      yield emit(type, {
        stepId: step.stepId,
        content: step.content,
      });
      if (step.type === "tool") {
        yield emit("tool_call_completed", {
          stepId: step.stepId,
          durationMs: step.durationMs,
        });
      }
    }

    yield emit("completed", {
      answer: response.answer,
      totalDurationMs: response.totalDurationMs,
      terminationReason: response.terminationReason,
    });
  }

  async *streamJob(jobId: string): AsyncGenerator<StreamEvent> {
    let sequence = 0;
    const emit = (type: StreamEvent["type"], payload: Record<string, unknown>): StreamEvent => ({
      type,
      sequence: ++sequence,
      timestamp: new Date().toISOString(),
      payload,
    });

    try {
      const status = await this.jobs.getJobStatus(jobId);
      const eventType =
        status.status === "waiting"
          ? "queued"
          : status.status === "active"
            ? "started"
            : status.status === "failed"
              ? "error"
              : "completed";

      yield emit(eventType, {
        jobId,
        status: status.status,
        progress: status.progress,
        attemptsMade: status.attemptsMade,
        failedReason: status.failedReason,
      });
    } catch (error) {
      yield emit("error", {
        jobId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async *streamEval(evalRunId: string): AsyncGenerator<StreamEvent> {
    let sequence = 0;
    const emit = (type: StreamEvent["type"], payload: Record<string, unknown>): StreamEvent => ({
      type,
      sequence: ++sequence,
      timestamp: new Date().toISOString(),
      payload,
    });

    yield emit("eval_progress", { evalRunId, progress: 0 });
    yield emit("sample_completed", { evalRunId, completedSamples: 0 });
    yield emit("metric_updates", { evalRunId, metrics: {} });
    yield emit("completed", { evalRunId, status: "completed" });
  }

  connect(userId?: string) {
    return this.gateway.connect(userId);
  }

  private createLifecycle(): StreamLifecycle {
    return {
      streamId: `stream-${randomUUID()}`,
      startedAt: new Date().toISOString(),
      status: "running",
    };
  }
}

function* tokenize(text: string): Generator<string> {
  const tokens = text.split(/\s+/).map((token) => token.trim()).filter((token) => token.length > 0);
  for (const token of tokens) {
    yield token;
  }
}
