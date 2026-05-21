/**
 * Agents Controller
 *
 * REST API endpoints for agent execution.
 * POST /agents/execute — Run a DocumentQA agent
 * POST /agents/react   — Run the full ReAct loop
 * POST /agents/multi   — Run the multi-agent pipeline
 * POST /agents/plan    — Run long-horizon plan-and-execute
 */

import { Controller, Post, Body, HttpCode, Inject, Req } from '@nestjs/common';
import {
  AgentExecuteRequestSchema,
  AgentReActRequestSchema,
  AgentMultiRequestSchema,
  AgentPlanRequestSchema,
  type AgentExecuteRequest,
  type AgentReActRequest,
  type AgentMultiRequest,
  type AgentPlanRequest,
} from '@groundedos/core';
import {
  AgentService,
  type AgentExecuteResponse,
  type AgentReActResponse,
  type AgentMultiResponse,
  type AgentPlanResponse,
} from './agent.service';
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

  @Post('react')
  @HttpCode(200)
  async react(
    @Req() rawRequest: FastifyRequest,
    @Body(new ZodValidationPipe('AgentReActRequest', AgentReActRequestSchema))
    request: AgentReActRequest
  ): Promise<AgentReActResponse> {
    const requestUser = getRequestUser(rawRequest);
    const activeTrace = getActiveTraceContext();

    return await this.agentService.executeReAct(request, {
      requestId: String(rawRequest.id),
      traceId: activeTrace?.traceId,
      sessionId: request.sessionId,
      tenantId: requestUser?.tenantId,
      userId: requestUser?.userId,
      indexId: request.indexId,
    });
  }

  @Post('multi')
  @HttpCode(200)
  async multi(
    @Req() rawRequest: FastifyRequest,
    @Body(new ZodValidationPipe('AgentMultiRequest', AgentMultiRequestSchema))
    request: AgentMultiRequest
  ): Promise<AgentMultiResponse> {
    const requestUser = getRequestUser(rawRequest);
    const activeTrace = getActiveTraceContext();

    return await this.agentService.executeMultiAgent(request, {
      requestId: String(rawRequest.id),
      traceId: activeTrace?.traceId,
      sessionId: request.sessionId,
      tenantId: requestUser?.tenantId,
      userId: requestUser?.userId,
      indexId: request.indexId,
    });
  }

  @Post('plan')
  @HttpCode(200)
  async plan(
    @Req() rawRequest: FastifyRequest,
    @Body(new ZodValidationPipe('AgentPlanRequest', AgentPlanRequestSchema))
    request: AgentPlanRequest
  ): Promise<AgentPlanResponse> {
    const requestUser = getRequestUser(rawRequest);
    const activeTrace = getActiveTraceContext();

    return await this.agentService.executePlan(request, {
      requestId: String(rawRequest.id),
      traceId: activeTrace?.traceId,
      sessionId: request.sessionId,
      tenantId: requestUser?.tenantId,
      userId: requestUser?.userId,
      indexId: request.indexId,
    });
  }
}

