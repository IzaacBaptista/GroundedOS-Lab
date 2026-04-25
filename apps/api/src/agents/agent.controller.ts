/**
 * Agents Controller
 *
 * REST API endpoints for agent execution.
 * POST /agents/execute - Run an agent with given parameters
 */

import { Controller, Post, Body, HttpCode, BadRequestException, Inject } from '@nestjs/common';
import { AgentService, type AgentExecuteRequest, type AgentExecuteResponse } from './agent.service';

@Controller('agents')
export class AgentsController {
  constructor(@Inject(AgentService) private agentService: AgentService) {}

  @Post('execute')
  @HttpCode(200)
  async execute(@Body() request: AgentExecuteRequest): Promise<AgentExecuteResponse> {
    try {
      if (!request.query || typeof request.query !== 'string') {
        throw new BadRequestException('Missing or invalid query');
      }

      if (!request.agentType || typeof request.agentType !== 'string') {
        throw new BadRequestException('Missing or invalid agentType');
      }

      return await this.agentService.executeAgent(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        sources: [],
        reasoning: [message],
        error: message,
      };
    }
  }
}
