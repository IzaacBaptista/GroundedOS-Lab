/**
 * Multi-Agent Runner
 *
 * Coordinates the full multi-agent pipeline:
 * PlannerAgent → ResearcherAgent → CriticAgent → SynthesizerAgent
 *
 * Features:
 * - Explicit handoff protocol between agents
 * - Evidence transfer across agents
 * - Safety checks before each handoff
 * - Dev Mode trace
 * - Auditable HandoffEnvelope for each transition
 */

import { randomUUID } from 'crypto';
import type { AgentExecutionContext, AgentResult } from './types.js';
import {
  PlannerAgent,
  ResearcherAgent,
  CriticAgent,
  SynthesizerAgent,
} from './specialized-agents.js';
import type {
  AgentDecision,
  AgentHandoff,
  MultiAgentMessage,
  AgentParticipant,
  Evidence,
  HandoffContext,
  HandoffEnvelope,
  HandoffResult,
  MultiAgentDevModeTrace,
  MultiAgentRunnerConfig,
  MultiAgentTrace,
} from './multi-agent-types.js';
import { DEFAULT_MULTI_AGENT_CONFIG } from './multi-agent-types.js';

// ---------------------------------------------------------------------------
// MultiAgentRunner
// ---------------------------------------------------------------------------

export class MultiAgentRunner {
  private readonly config: MultiAgentRunnerConfig;
  private readonly plannerAgent: PlannerAgent;
  private readonly researcherAgent: ResearcherAgent;
  private readonly criticAgent: CriticAgent;
  private readonly synthesizerAgent: SynthesizerAgent;

  constructor(config: Partial<MultiAgentRunnerConfig> = {}) {
    this.config = { ...DEFAULT_MULTI_AGENT_CONFIG, ...config };
    this.plannerAgent = new PlannerAgent();
    this.researcherAgent = new ResearcherAgent();
    this.criticAgent = new CriticAgent();
    this.synthesizerAgent = new SynthesizerAgent();
  }

  /**
   * Run the full multi-agent pipeline for a given query.
   */
  async run(
    query: string,
    context: AgentExecutionContext,
  ): Promise<MultiAgentTrace> {
    const traceId = randomUUID();
    const startedAt = Date.now();
    const deadline = startedAt + Math.min(context.timeout, this.config.timeoutMs);

    const handoffs: AgentHandoff[] = [];
    const messages: MultiAgentMessage[] = [];
    const decisions: AgentDecision[] = [];
    const evidence: Evidence[] = [];
    const criticalGaps: string[] = [];
    const participants: AgentParticipant[] = [];

    let finalAnswer: string | undefined;
    let success = false;

    try {
      // -----------------------------------------------------------------------
      // Step 1: PlannerAgent — generate a plan
      // -----------------------------------------------------------------------
      const plannerCtx = this._makeAgentContext(context, 'planner');
      const plannerStart = Date.now();
      participants.push({
        agentId: this.plannerAgent.id,
        agentName: this.plannerAgent.name,
        role: 'planner',
        activatedAt: plannerStart,
        stepsExecuted: 0,
      });

      const plannerResult = await this.plannerAgent.execute(plannerCtx, query);
      const plannerParticipant = participants[participants.length - 1];
      plannerParticipant.completedAt = Date.now();
      plannerParticipant.stepsExecuted = plannerResult.toolCalls.length;

      decisions.push({
        decisionId: randomUUID(),
        agentId: this.plannerAgent.id,
        description: 'Generated execution plan',
        rationale: plannerResult.reasoning[0] ?? 'Plan generated',
        timestamp: Date.now(),
        outcome: 'plan-ready',
      });

      // -----------------------------------------------------------------------
      // Step 2: ResearcherAgent — collect evidence
      // -----------------------------------------------------------------------
      if (Date.now() >= deadline) {
        throw new Error('Global timeout reached after planning');
      }

      const plannerHandoff = this._createHandoff(
        this.plannerAgent.id,
        this.plannerAgent.name,
        this.researcherAgent.id,
        this.researcherAgent.name,
        `Research the following objective: ${query}`,
        {
          originalQuery: query,
          sessionId: context.sessionId,
          evidence: [],
          constraints: ['Only use evidence from indexed documents'],
          executionLimits: {
            maxSteps: this.config.maxTotalSteps / 4,
            timeoutMs: this.config.agentTimeoutMs,
          },
        },
        'Planner completed plan; researcher needed to collect evidence',
        'Structured evidence with source citations',
      );
      handoffs.push(plannerHandoff);

      const researcherCtx = this._makeAgentContext(context, 'researcher');
      const researcherStart = Date.now();
      participants.push({
        agentId: this.researcherAgent.id,
        agentName: this.researcherAgent.name,
        role: 'researcher',
        activatedAt: researcherStart,
        stepsExecuted: 0,
      });

      const researcherResult = await this.researcherAgent.execute(researcherCtx, query);
      const researcherParticipant = participants[participants.length - 1];
      researcherParticipant.completedAt = Date.now();
      researcherParticipant.stepsExecuted = researcherResult.toolCalls.length;

      // Extract evidence from researcher tool calls
      const researchEvidence = this._extractEvidence(researcherResult, this.researcherAgent.id);
      evidence.push(...researchEvidence);

      this._completeHandoff(plannerHandoff, {
        success: researcherResult.success,
        answer: researcherResult.answer,
        evidence: researchEvidence,
        reasoning: researcherResult.reasoning,
        durationMs: Date.now() - researcherStart,
      });

      // -----------------------------------------------------------------------
      // Step 3: CriticAgent — evaluate evidence and find gaps
      // -----------------------------------------------------------------------
      if (Date.now() >= deadline) {
        throw new Error('Global timeout reached after research');
      }

      const researchHandoff = this._createHandoff(
        this.researcherAgent.id,
        this.researcherAgent.name,
        this.criticAgent.id,
        this.criticAgent.name,
        `Evaluate the collected evidence and identify gaps for: "${query}"`,
        {
          originalQuery: query,
          sessionId: context.sessionId,
          evidence,
          constraints: ['Flag low-confidence evidence', 'Identify information gaps'],
          executionLimits: {
            maxSteps: this.config.maxTotalSteps / 4,
            timeoutMs: this.config.agentTimeoutMs,
          },
          metadata: { researcherAnswer: researcherResult.answer },
        },
        'Researcher collected evidence; critic needed to validate quality',
        'Critique report with quality scores and gap analysis',
      );
      handoffs.push(researchHandoff);

      const criticCtx = this._makeAgentContext(context, 'critic');
      const criticStart = Date.now();
      participants.push({
        agentId: this.criticAgent.id,
        agentName: this.criticAgent.name,
        role: 'critic',
        activatedAt: criticStart,
        stepsExecuted: 0,
      });

      // Pass evidence to critic
      const evidencePayload = JSON.stringify({ evidence });
      const criticResult = await this.criticAgent.execute(criticCtx, evidencePayload);
      const criticParticipant = participants[participants.length - 1];
      criticParticipant.completedAt = Date.now();
      criticParticipant.stepsExecuted = criticResult.toolCalls.length;

      // Extract gaps from critic output
      const criticOutput = this._extractCriticOutput(criticResult);
      const rawGaps = criticOutput['gaps'];
      if (Array.isArray(rawGaps)) {
        criticalGaps.push(...(rawGaps as string[]));
      }

      decisions.push({
        decisionId: randomUUID(),
        agentId: this.criticAgent.id,
        description: `Evidence critique: quality=${criticOutput.qualityScore ?? 'unknown'}`,
        rationale: criticResult.reasoning[0] ?? 'Critique performed',
        timestamp: Date.now(),
        outcome: criticalGaps.length === 0 ? 'evidence-approved' : 'gaps-identified',
      });

      this._completeHandoff(researchHandoff, {
        success: criticResult.success,
        answer: criticResult.answer,
        evidence: [],
        reasoning: criticResult.reasoning,
        durationMs: Date.now() - criticStart,
      });

      // -----------------------------------------------------------------------
      // Step 4: SynthesizerAgent — produce final answer
      // -----------------------------------------------------------------------
      if (Date.now() >= deadline) {
        throw new Error('Global timeout reached after critique');
      }

      const criticHandoff = this._createHandoff(
        this.criticAgent.id,
        this.criticAgent.name,
        this.synthesizerAgent.id,
        this.synthesizerAgent.name,
        `Synthesize a final grounded answer for: "${query}"`,
        {
          originalQuery: query,
          sessionId: context.sessionId,
          evidence,
          constraints: [
            'Only use approved evidence',
            'Include source citations',
            criticalGaps.length > 0
              ? `Note identified gaps: ${criticalGaps.join('; ')}`
              : 'Evidence is sufficient',
          ],
          executionLimits: {
            maxSteps: this.config.maxTotalSteps / 4,
            timeoutMs: this.config.agentTimeoutMs,
          },
          metadata: { criticOutput },
        },
        'Critique approved; synthesizer needed to produce final answer',
        'Final grounded answer with source citations',
      );
      handoffs.push(criticHandoff);

      const synthesizerCtx = this._makeAgentContext(context, 'synthesizer');
      const synthesizerStart = Date.now();
      participants.push({
        agentId: this.synthesizerAgent.id,
        agentName: this.synthesizerAgent.name,
        role: 'synthesizer',
        activatedAt: synthesizerStart,
        stepsExecuted: 0,
      });

      // Pass critique output + evidence to synthesizer
      const synthInput = JSON.stringify({ approvedEvidence: evidence, ...criticOutput });
      const synthesizerResult = await this.synthesizerAgent.execute(synthesizerCtx, synthInput);
      const synthesizerParticipant = participants[participants.length - 1];
      synthesizerParticipant.completedAt = Date.now();
      synthesizerParticipant.stepsExecuted = synthesizerResult.toolCalls.length;

      finalAnswer = synthesizerResult.answer;
      success = synthesizerResult.success;

      this._completeHandoff(criticHandoff, {
        success: synthesizerResult.success,
        answer: synthesizerResult.answer,
        evidence: [],
        reasoning: synthesizerResult.reasoning,
        durationMs: Date.now() - synthesizerStart,
      });

      decisions.push({
        decisionId: randomUUID(),
        agentId: this.synthesizerAgent.id,
        description: 'Final answer synthesized',
        rationale: synthesizerResult.reasoning[0] ?? 'Synthesis complete',
        timestamp: Date.now(),
        outcome: 'answer-ready',
      });
    } catch (err) {
      finalAnswer = undefined;
      success = false;
    }

    const completedAt = Date.now();

    const devModeTrace: MultiAgentDevModeTrace | undefined =
      context.devMode || this.config.devMode
        ? {
            agents: participants,
            handoffs: handoffs.map((h) => ({
              from: h.fromAgentName,
              to: h.toAgentName,
              reason: h.reasonForHandoff,
              evidenceCount: h.context.evidence.length,
              status: h.status,
            })),
            decisions,
            criticalGaps,
            evidenceSummary: evidence.map((e) => `[${e.confidence.toFixed(2)}] ${e.content.slice(0, 100)}`),
          }
        : undefined;

    return {
      traceId,
      sessionId: context.sessionId,
      query,
      agents: participants,
      handoffs,
      messages,
      decisions,
      evidence,
      criticalGaps,
      finalAnswer,
      success,
      startedAt,
      completedAt,
      totalDurationMs: completedAt - startedAt,
      devMode: devModeTrace,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _makeAgentContext(
    parentCtx: AgentExecutionContext,
    role: string,
  ): AgentExecutionContext {
    return {
      sessionId: parentCtx.sessionId,
      userId: parentCtx.userId,
      indexId: parentCtx.indexId,
      maxSteps: Math.floor(this.config.maxTotalSteps / 4),
      timeout: this.config.agentTimeoutMs,
      devMode: parentCtx.devMode,
    };
  }

  private _createHandoff(
    fromId: string,
    fromName: string,
    toId: string,
    toName: string,
    task: string,
    ctx: HandoffContext,
    reason: string,
    expectedOutput: string,
  ): AgentHandoff {
    return {
      handoffId: randomUUID(),
      fromAgentId: fromId,
      toAgentId: toId,
      fromAgentName: fromName,
      toAgentName: toName,
      task,
      context: ctx,
      reasonForHandoff: reason,
      expectedOutput,
      status: 'in-progress',
      createdAt: Date.now(),
    };
  }

  private _completeHandoff(handoff: AgentHandoff, result: HandoffResult): void {
    handoff.status = result.success ? 'completed' : 'failed';
    handoff.completedAt = Date.now();
  }

  private _extractEvidence(result: AgentResult, agentId: string): Evidence[] {
    const evidence: Evidence[] = [];

    for (const tc of result.toolCalls) {
      if (tc.status !== 'success' || !tc.output) continue;
      const output = tc.output as Record<string, unknown>;

      if (Array.isArray(output['evidence'])) {
        evidence.push(...(output['evidence'] as Evidence[]));
      } else if (Array.isArray(output['retrievedChunkIds'])) {
        evidence.push({
          evidenceId: randomUUID(),
          sourceAgentId: agentId,
          content: result.answer ?? 'Retrieved evidence',
          sources: output['retrievedChunkIds'] as string[],
          confidence: 0.8,
          collectedAt: Date.now(),
        });
      }
    }

    if (evidence.length === 0 && result.answer) {
      evidence.push({
        evidenceId: randomUUID(),
        sourceAgentId: agentId,
        content: result.answer,
        sources: result.sources,
        confidence: 0.75,
        collectedAt: Date.now(),
      });
    }

    return evidence;
  }

  private _extractCriticOutput(result: AgentResult): Record<string, unknown> {
    for (const tc of result.toolCalls) {
      if (tc.status !== 'success' || !tc.output) continue;
      const output = tc.output as Record<string, unknown>;
      if ('qualityScore' in output || 'gaps' in output) {
        return output;
      }
    }
    return { qualityScore: 0.7, gaps: [], issues: [], suggestions: [] };
  }
}

/**
 * Create a HandoffEnvelope for logging/replay.
 */
export function createHandoffEnvelope(handoff: AgentHandoff, result?: HandoffResult): HandoffEnvelope {
  return {
    envelopeId: randomUUID(),
    handoff,
    result,
    serializedAt: Date.now(),
    protocolVersion: '1.0',
  };
}
