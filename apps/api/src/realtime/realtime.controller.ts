import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Req, Res } from "@nestjs/common";
import {
  AgentReActRequestSchema,
  QueryStreamRequestSchema,
  validateApiInput,
  type AgentReActRequest,
  type QueryStreamRequest,
} from "@groundedos/core";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getRequestUser } from "../common/auth-context";
import { ApiRequestError } from "../errors";
import { StreamingResponseManager } from "./streaming-response.manager";

@Controller()
export class RealtimeController {
  constructor(private readonly streaming: StreamingResponseManager) {}

  @Post("query/stream")
  @HttpCode(HttpStatus.OK)
  async streamQuery(
    @Req() request: FastifyRequest,
    @Headers("accept") accept: string | undefined,
    @Body() body: unknown,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const validated = validateApiInput("QueryStreamRequest", QueryStreamRequestSchema, body) as QueryStreamRequest;
    const user = getRequestUser(request);
    const events = this.streaming.streamRagQuery(validated, {
      requestId: String(request.id),
      ownerId: user?.userId,
      tenantId: user?.tenantId,
      apiKeyId: user?.apiKeyId,
    });

    if (validated.streamMode === "json" || !accept?.includes("text/event-stream")) {
      reply.type("application/json");
      reply.send(await this.streaming.collect(events));
      return;
    }

    await this.streaming.streamToSse(reply, events);
  }

  @Post("agents/stream")
  @HttpCode(HttpStatus.OK)
  async streamAgents(
    @Req() request: FastifyRequest,
    @Headers("accept") accept: string | undefined,
    @Body() body: unknown,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const validated = validateApiInput("AgentReActRequest", AgentReActRequestSchema, body) as AgentReActRequest;
    const user = getRequestUser(request);
    const events = this.streaming.streamAgentRun(validated, {
      requestId: String(request.id),
      ownerId: user?.userId,
      tenantId: user?.tenantId,
      apiKeyId: user?.apiKeyId,
    });

    if (!accept?.includes("text/event-stream")) {
      reply.type("application/json");
      reply.send(await this.streaming.collect(events));
      return;
    }

    await this.streaming.streamToSse(reply, events);
  }

  @Get("jobs/:id/stream")
  async streamJob(
    @Param("id") id: string,
    @Headers("accept") accept: string | undefined,
    @Res() reply: FastifyReply
  ): Promise<void> {
    if (!id.trim()) {
      throw new ApiRequestError("Job id is required.", 400);
    }

    const events = this.streaming.streamJob(id);

    if (!accept?.includes("text/event-stream")) {
      reply.type("application/json");
      reply.send(await this.streaming.collect(events));
      return;
    }

    await this.streaming.streamToSse(reply, events);
  }

  @Get("evals/:id/stream")
  async streamEval(
    @Param("id") id: string,
    @Headers("accept") accept: string | undefined,
    @Res() reply: FastifyReply
  ): Promise<void> {
    if (!id.trim()) {
      throw new ApiRequestError("Eval run id is required.", 400);
    }

    const events = this.streaming.streamEval(id);

    if (!accept?.includes("text/event-stream")) {
      reply.type("application/json");
      reply.send(await this.streaming.collect(events));
      return;
    }

    await this.streaming.streamToSse(reply, events);
  }

  @Get("ws/connect")
  async connect(@Req() request: FastifyRequest): Promise<ReturnType<StreamingResponseManager["connect"]>> {
    const user = getRequestUser(request);
    return this.streaming.connect(user?.userId);
  }
}
