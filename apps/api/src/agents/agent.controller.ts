/**
 * Agents Controller
 *
 * REST API endpoints for agent execution.
 * POST /agents/execute - Run an agent with given parameters
 */

import { Controller, Post, Body, HttpCode, Inject } from '@nestjs/common';
import {
  AgentExecuteRequestSchema,
  type AgentExecuteRequest,
} from '@groundedos/core';
import { AgentService, type AgentExecuteResponse } from './agent.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller('agents')
export class AgentsController {
  constructor(@Inject(AgentService) private agentService: AgentService) {}

  @Post('execute')
  @HttpCode(200)
  async execute(
    @Body(new ZodValidationPipe<AgentExecuteRequest>('AgentExecuteRequest', AgentExecuteRequestSchema))
    request: AgentExecuteRequest
  ): Promise<AgentExecuteResponse> {
    return await this.agentService.executeAgent(request);
  }
}
