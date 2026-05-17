/**
 * Agents Controller
 *
 * REST API endpoints for agent execution.
 * POST /agents/execute - Run an agent with given parameters
 */

import { Controller, Post, Body, HttpCode, Inject, Req } from '@nestjs/common';
import {
  AgentExecuteRequestSchema,
  type AgentExecuteRequest,
} from '@groundedos/core';
import { AgentService, type AgentExecuteResponse } from './agent.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { FastifyRequest } from "fastify";
import { getRequestUser } from "../common/auth-context";
import { getActiveTraceContext } from "../otel";

@Controller('agents')
export class AgentsController {
  constructor(@Inject(AgentService) private agentService: AgentService) {}

  @Post('execute')
  @HttpCode(200)
  async execute(
    @Req() rawRequest: FastifyRequest,
    @Body(new ZodValidationPipe('AgentExecuteRequest', AgentExecuteRequestSchema))
    request: AgentExecuteRequest
  ): Promise<AgentExecuteResponse> {
    const requestUser = getRequestUser(rawRequest);
    const activeTrace = getActiveTraceContext();

    return await this.agentService.executeAgent(request, {
      requestId: String(rawRequest.id),
      traceId: activeTrace?.traceId,
      sessionId: request.sessionId,
      tenantId: requestUser?.tenantId,
      userId: requestUser?.userId,
      indexId: request.indexId,
    });
  }
}
