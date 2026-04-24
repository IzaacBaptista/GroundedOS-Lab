/**
 * Agents Module
 *
 * NestJS module for agent orchestration and execution.
 */

import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentsController } from './agent.controller';

@Module({
  providers: [AgentService],
  controllers: [AgentsController],
  exports: [AgentService],
})
export class AgentsModule {}
