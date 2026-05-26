/**
 * Specialized Agents
 *
 * Concrete agent implementations for the multi-agent pipeline:
 *
 * PlannerAgent    — breaks the objective into a structured TaskPlan
 * ResearcherAgent — executes retrieval and collects evidence
 * CriticAgent     — evaluates evidence quality and finds gaps
 * SynthesizerAgent — consolidates evidence into a final grounded answer
 *
 * Each agent:
 * - Extends BaseAgent (backward-compatible)
 * - Exposes its AgentRole
 * - Can be used standalone or via MultiAgentRunner
 */

import { randomUUID } from 'crypto';
import { BaseAgent } from './agent.js';
import type { AgentExecutionContext, AgentResult, Tool } from './types.js';
import type { AgentRole, Evidence } from './multi-agent-types.js';
import type { TaskPlan, PlanNode, PlanEdge } from './planning-types.js';
import { DEFAULT_PLANNING_STRATEGY } from './planning-types.js';

// ---------------------------------------------------------------------------
// PlannerAgent
// ---------------------------------------------------------------------------

export interface PlannerAgentConfig {
  id?: string;
  name?: string;
}

/**
 * PlannerAgent decomposes a high-level objective into a structured TaskPlan.
 *
 * Steps:
 * 1. Parse the query to identify sub-goals
 * 2. Assign tools and agents to each sub-goal
 * 3. Detect dependencies between sub-goals
 * 4. Output a TaskPlan
 */
export class PlannerAgent extends BaseAgent {
  readonly role: AgentRole = 'planner';

  constructor(config?: PlannerAgentConfig) {
    super(
      config?.id ?? 'planner-agent',
      config?.name ?? 'Planner Agent',
      'Decomposes complex objectives into structured, executable plans.',
      'Break down the user objective into a clear, ordered set of sub-tasks with assigned agents and required tools.',
    );

    this.registerTool(createPlanGeneratorTool());
  }

  protected async reasoningStep(
    input: string,
    context: AgentExecutionContext,
  ): Promise<{
    reasoning: string;
    toolName: string | null;
    toolInput: Record<string, unknown> | null;
    directAnswer: string | null;
  }> {
    if (this.state.currentStep === 0) {
      return {
        reasoning: `Planning: Decomposing objective into sub-tasks: "${input}"`,
        toolName: 'generate-plan',
        toolInput: { objective: input, sessionId: context.sessionId },
        directAnswer: null,
      };
    }

    const lastCall = this.state.toolCalls[this.state.toolCalls.length - 1];
    if (lastCall?.status === 'success' && lastCall.output) {
      return {
        reasoning: 'Plan generated successfully. Ready for handoff to ResearcherAgent.',
        toolName: null,
        toolInput: null,
        directAnswer: JSON.stringify(lastCall.output),
      };
    }

    return {
      reasoning: 'Plan generation complete.',
      toolName: null,
      toolInput: null,
      directAnswer: `Plan for: ${input}`,
    };
  }
}

function createPlanGeneratorTool(): Tool {
  return {
    name: 'generate-plan',
    description: 'Generates a structured TaskPlan from a high-level objective.',
    inputSchema: {
      type: 'object',
      properties: {
        objective: { type: 'string' },
        sessionId: { type: 'string' },
      },
      required: ['objective'],
    },
    call: async (input: Record<string, unknown>) => {
      const objective = String(input['objective'] ?? '');
      const now = Date.now();

      // Heuristic plan decomposition
      const subtasks = decomposeObjective(objective);
      const nodes: PlanNode[] = subtasks.map((task, idx) => ({
        nodeId: `node-${idx + 1}`,
        label: task.label,
        description: task.description,
        dependencies: idx === 0 ? [] : [`node-${idx}`],
        status: 'pending',
        requiredTools: task.tools,
        successCriteria: [`${task.label} completed successfully`],
        risks: task.risks,
        expectedOutput: task.expectedOutput,
      }));

      const edges: PlanEdge[] = nodes
        .filter((n) => n.dependencies.length > 0)
        .map((n) => ({
          edgeId: randomUUID(),
          from: n.dependencies[0],
          to: n.nodeId,
          isDependency: true,
        }));

      const plan: TaskPlan = {
        planId: randomUUID(),
        objective,
        nodes,
        edges,
        successCriteria: ['All sub-tasks completed', 'Final answer grounded in evidence'],
        risks: ['Evidence may be incomplete', 'Tool failures may require replanning'],
        allRequiredTools: [...new Set(nodes.flatMap((n) => n.requiredTools))],
        responsibleAgents: ['researcher-agent', 'critic-agent', 'synthesizer-agent'],
        status: 'ready',
        strategy: DEFAULT_PLANNING_STRATEGY,
        createdAt: now,
        updatedAt: now,
        revisions: [],
      };

      return plan;
    },
  };
}

function decomposeObjective(objective: string): Array<{
  label: string;
  description: string;
  tools: string[];
  risks: string[];
  expectedOutput: string;
}> {
  // Heuristic decomposition based on keywords
  const tasks = [];

  tasks.push({
    label: 'Retrieve evidence',
    description: `Search for relevant information to answer: "${objective}"`,
    tools: ['retrieve-from-index'],
    risks: ['Index may not contain relevant information'],
    expectedOutput: 'Top-K relevant document chunks',
  });

  tasks.push({
    label: 'Analyze evidence',
    description: 'Analyze retrieved chunks for relevance and quality.',
    tools: [],
    risks: ['Evidence may be contradictory'],
    expectedOutput: 'Curated evidence with confidence scores',
  });

  tasks.push({
    label: 'Critique and fill gaps',
    description: 'Identify missing information and suggest additional searches.',
    tools: ['retrieve-from-index'],
    risks: ['Gaps may not be fillable from available documents'],
    expectedOutput: 'Gap analysis report',
  });

  tasks.push({
    label: 'Synthesize final answer',
    description: `Generate a grounded final answer for: "${objective}"`,
    tools: ['summarize-with-context'],
    risks: ['Synthesis may miss nuanced details'],
    expectedOutput: 'Grounded answer with source citations',
  });

  return tasks;
}

// ---------------------------------------------------------------------------
// ResearcherAgent
// ---------------------------------------------------------------------------

export interface ResearcherAgentConfig {
  id?: string;
  name?: string;
}

/**
 * ResearcherAgent executes retrieval and collects evidence.
 *
 * Steps:
 * 1. Retrieve top-K chunks from document index
 * 2. Collect and structure evidence
 * 3. Return evidence for CriticAgent review
 */
export class ResearcherAgent extends BaseAgent {
  readonly role: AgentRole = 'researcher';
  private ragServiceGetterFn: (() => unknown) | null = null;

  constructor(config?: ResearcherAgentConfig) {
    super(
      config?.id ?? 'researcher-agent',
      config?.name ?? 'Researcher Agent',
      'Executes retrieval and collects structured evidence from documents.',
      'Find and curate evidence from the document corpus to answer the user objective.',
    );

    this.registerTool(createResearchRetrievalTool(() => this.ragServiceGetterFn?.()));
  }

  setRagService(ragService: unknown): void {
    this.ragServiceGetterFn = () => ragService;
  }

  protected async reasoningStep(
    input: string,
    context: AgentExecutionContext,
  ): Promise<{
    reasoning: string;
    toolName: string | null;
    toolInput: Record<string, unknown> | null;
    directAnswer: string | null;
  }> {
    if (this.state.currentStep === 0) {
      return {
        reasoning: `Researching: Retrieving evidence for "${input}"`,
        toolName: 'research-retrieve',
        toolInput: { query: input, indexId: context.indexId ?? 'default', topK: 5 },
        directAnswer: null,
      };
    }

    const lastCall = this.state.toolCalls[this.state.toolCalls.length - 1];
    if (lastCall?.status === 'success' && lastCall.output) {
      return {
        reasoning: 'Evidence collected. Ready for CriticAgent review.',
        toolName: null,
        toolInput: null,
        directAnswer: JSON.stringify(lastCall.output),
      };
    }

    return {
      reasoning: 'Research complete.',
      toolName: null,
      toolInput: null,
      directAnswer: `Research results for: ${input}`,
    };
  }
}

function createResearchRetrievalTool(ragServiceGetterFn: () => unknown): Tool {
  return {
    name: 'research-retrieve',
    description: 'Retrieves and structures evidence from document index.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        indexId: { type: 'string' },
        topK: { type: 'number' },
      },
      required: ['query', 'indexId'],
    },
    call: async (input: Record<string, unknown>) => {
      const query = String(input['query'] ?? '');
      const indexId = String(input['indexId'] ?? 'default');
      const topK = Number(input['topK'] ?? 5);

      // In production this would call the RAG service
      void ragServiceGetterFn();

      const evidence: Evidence[] = [
        {
          evidenceId: randomUUID(),
          sourceAgentId: 'researcher-agent',
          content: `Primary evidence for: "${query}" from index ${indexId}`,
          sources: [`chunk-${indexId}-1`, `chunk-${indexId}-2`],
          confidence: 0.88,
          collectedAt: Date.now(),
          tags: ['primary', 'retrieved'],
        },
        {
          evidenceId: randomUUID(),
          sourceAgentId: 'researcher-agent',
          content: `Secondary evidence: additional context for "${query}"`,
          sources: [`chunk-${indexId}-3`],
          confidence: 0.76,
          collectedAt: Date.now(),
          tags: ['secondary', 'retrieved'],
        },
      ].slice(0, topK);

      return {
        evidence,
        retrievedChunkIds: evidence.flatMap((e) => e.sources),
        query,
        indexId,
        totalRetrieved: evidence.length,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// CriticAgent
// ---------------------------------------------------------------------------

export interface CriticAgentConfig {
  id?: string;
  name?: string;
}

/**
 * CriticAgent evaluates evidence quality, detects gaps, and suggests improvements.
 *
 * Steps:
 * 1. Evaluate each piece of evidence
 * 2. Identify gaps or inconsistencies
 * 3. Suggest additional searches if needed
 * 4. Produce a critique report
 */
export class CriticAgent extends BaseAgent {
  readonly role: AgentRole = 'critic';

  constructor(config?: CriticAgentConfig) {
    super(
      config?.id ?? 'critic-agent',
      config?.name ?? 'Critic Agent',
      'Evaluates evidence quality, detects gaps, and suggests improvements.',
      'Critically assess the collected evidence for completeness, consistency, and relevance.',
    );

    this.registerTool(createCritiqueEvidenceTool());
  }

  protected async reasoningStep(
    input: string,
    context: AgentExecutionContext,
  ): Promise<{
    reasoning: string;
    toolName: string | null;
    toolInput: Record<string, unknown> | null;
    directAnswer: string | null;
  }> {
    if (this.state.currentStep === 0) {
      return {
        reasoning: `Critic: Evaluating evidence for "${input}"`,
        toolName: 'critique-evidence',
        toolInput: { evidenceJson: input, query: context.sessionId },
        directAnswer: null,
      };
    }

    const lastCall = this.state.toolCalls[this.state.toolCalls.length - 1];
    if (lastCall?.status === 'success') {
      return {
        reasoning: 'Critique complete. Forwarding to SynthesizerAgent.',
        toolName: null,
        toolInput: null,
        directAnswer: JSON.stringify(lastCall.output),
      };
    }

    return {
      reasoning: 'Critique complete.',
      toolName: null,
      toolInput: null,
      directAnswer: `Critique for: ${input}`,
    };
  }
}

function createCritiqueEvidenceTool(): Tool {
  return {
    name: 'critique-evidence',
    description: 'Evaluates evidence quality and identifies gaps.',
    inputSchema: {
      type: 'object',
      properties: {
        evidenceJson: { type: 'string' },
        query: { type: 'string' },
      },
      required: ['evidenceJson', 'query'],
    },
    call: async (input: Record<string, unknown>) => {
      const evidenceJson = String(input['evidenceJson'] ?? '[]');

      let evidence: Evidence[] = [];
      try {
        const parsed = JSON.parse(evidenceJson);
        if (parsed && typeof parsed === 'object' && 'evidence' in parsed) {
          evidence = parsed.evidence as Evidence[];
        } else if (Array.isArray(parsed)) {
          evidence = parsed as Evidence[];
        }
      } catch {
        // Evidence may not be JSON; treat as raw text
      }

      const gaps: string[] = [];
      const issues: string[] = [];

      if (evidence.length === 0) {
        gaps.push('No structured evidence provided');
        issues.push('Evidence collection may have failed');
      } else {
        const lowConfidence = evidence.filter((e) => e.confidence < 0.7);
        if (lowConfidence.length > 0) {
          issues.push(`${lowConfidence.length} evidence item(s) have low confidence (<0.7)`);
        }
        if (evidence.length < 2) {
          gaps.push('Insufficient evidence diversity — consider additional retrieval');
        }
      }

      return {
        qualityScore: evidence.length > 0 ? 0.8 : 0.2,
        gaps,
        issues,
        suggestions: gaps.map((g) => `Address gap: ${g}`),
        approvedEvidence: evidence.filter((e) => e.confidence >= 0.7),
        rejectedEvidence: evidence.filter((e) => e.confidence < 0.7),
        requiresAdditionalSearch: gaps.length > 0,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// SynthesizerAgent
// ---------------------------------------------------------------------------

export interface SynthesizerAgentConfig {
  id?: string;
  name?: string;
}

/**
 * SynthesizerAgent consolidates approved evidence into a final grounded answer.
 *
 * Steps:
 * 1. Receive approved evidence from CriticAgent
 * 2. Generate a final answer with source attribution
 * 3. Apply output policy (safety, grounding requirements)
 */
export class SynthesizerAgent extends BaseAgent {
  readonly role: AgentRole = 'synthesizer';

  constructor(config?: SynthesizerAgentConfig) {
    super(
      config?.id ?? 'synthesizer-agent',
      config?.name ?? 'Synthesizer Agent',
      'Consolidates evidence into a final grounded answer with source attribution.',
      'Produce a clear, well-grounded answer from the collected evidence, respecting safety and output policies.',
    );

    this.registerTool(createSynthesisTool());
  }

  protected async reasoningStep(
    input: string,
    context: AgentExecutionContext,
  ): Promise<{
    reasoning: string;
    toolName: string | null;
    toolInput: Record<string, unknown> | null;
    directAnswer: string | null;
  }> {
    if (this.state.currentStep === 0) {
      return {
        reasoning: `Synthesizer: Consolidating evidence to answer query.`,
        toolName: 'synthesize-answer',
        toolInput: { evidenceJson: input, query: input },
        directAnswer: null,
      };
    }

    const lastCall = this.state.toolCalls[this.state.toolCalls.length - 1];
    if (lastCall?.status === 'success' && lastCall.output) {
      const output = lastCall.output as Record<string, unknown>;
      return {
        reasoning: 'Answer synthesized.',
        toolName: null,
        toolInput: null,
        directAnswer: String(output['answer'] ?? 'Synthesis complete.'),
      };
    }

    return {
      reasoning: 'Synthesis complete.',
      toolName: null,
      toolInput: null,
      directAnswer: `Synthesized answer for: ${input}`,
    };
  }
}

function createSynthesisTool(): Tool {
  return {
    name: 'synthesize-answer',
    description: 'Consolidates evidence into a grounded final answer with source citations.',
    inputSchema: {
      type: 'object',
      properties: {
        evidenceJson: { type: 'string' },
        query: { type: 'string' },
      },
      required: ['query'],
    },
    call: async (input: Record<string, unknown>) => {
      const query = String(input['query'] ?? '');
      const evidenceJson = String(input['evidenceJson'] ?? '[]');

      let evidence: Evidence[] = [];
      let critiqueOutput: Record<string, unknown> = {};

      try {
        const parsed = JSON.parse(evidenceJson);
        if (parsed && typeof parsed === 'object') {
          if ('approvedEvidence' in parsed) {
            critiqueOutput = parsed as Record<string, unknown>;
            evidence = (parsed.approvedEvidence as Evidence[]) ?? [];
          } else if ('evidence' in parsed) {
            evidence = (parsed.evidence as Evidence[]) ?? [];
          } else if (Array.isArray(parsed)) {
            evidence = parsed as Evidence[];
          }
        }
      } catch {
        // Not JSON; treat as free text
      }

      const sources = evidence.flatMap((e) => e.sources);
      const evidenceText = evidence.map((e) => e.content).join(' ');

      const answer =
        evidence.length > 0
          ? `Based on ${evidence.length} evidence items: ${evidenceText}`.slice(0, 500)
          : `Limited evidence available for: "${query}". Please verify with additional sources.`;

      return {
        answer,
        sources: [...new Set(sources)],
        groundingScore: evidence.length > 0 ? 0.85 : 0.2,
        evidenceCount: evidence.length,
        qualityScore: (critiqueOutput['qualityScore'] as number | undefined) ?? 0.7,
      };
    },
  };
}
