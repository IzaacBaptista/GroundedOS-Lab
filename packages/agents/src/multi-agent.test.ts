/**
 * Multi-Agent Pipeline Tests
 *
 * Tests for:
 * - MultiAgentRunner full pipeline (Planner → Researcher → Critic → Synthesizer)
 * - Handoff protocol structure and auditability
 * - Dev mode multi-agent trace
 * - Specialized agent creation and execution
 */

import { describe, it, expect } from 'vitest';
import { MultiAgentRunner, createHandoffEnvelope } from './multi-agent-runner';
import {
  PlannerAgent,
  ResearcherAgent,
  CriticAgent,
  SynthesizerAgent,
} from './specialized-agents';
import type { AgentExecutionContext } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<AgentExecutionContext> = {}): AgentExecutionContext {
  return {
    sessionId: 'test-session',
    indexId: 'test-index',
    maxSteps: 20,
    timeout: 30_000,
    devMode: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Specialized agents
// ---------------------------------------------------------------------------

describe('PlannerAgent', () => {
  it('should initialize with correct role and metadata', () => {
    const agent = new PlannerAgent();
    expect(agent.id).toBe('planner-agent');
    expect(agent.name).toBe('Planner Agent');
    expect(agent.role).toBe('planner');
    expect(agent.tools.has('generate-plan')).toBe(true);
  });

  it('should generate a plan when executed', async () => {
    const agent = new PlannerAgent();
    const result = await agent.execute(makeContext(), 'Research the history of AI');

    expect(result.success).toBe(true);
    expect(result.toolCalls.length).toBeGreaterThan(0);

    const planCall = result.toolCalls.find((tc) => tc.toolName === 'generate-plan');
    expect(planCall).toBeDefined();
    expect(planCall!.status).toBe('success');

    const plan = planCall!.output as Record<string, unknown>;
    expect(plan).toBeDefined();
    expect(typeof plan['planId']).toBe('string');
    expect(Array.isArray(plan['nodes'])).toBe(true);
    expect(Array.isArray(plan['edges'])).toBe(true);
    expect(plan['status']).toBe('ready');
  });

  it('should produce a plan with multiple nodes and dependencies', async () => {
    const agent = new PlannerAgent();
    const result = await agent.execute(makeContext(), 'Explain quantum computing');

    const planCall = result.toolCalls.find((tc) => tc.toolName === 'generate-plan');
    const plan = planCall!.output as Record<string, unknown>;
    const nodes = plan['nodes'] as Array<Record<string, unknown>>;

    expect(nodes.length).toBeGreaterThan(1);
    // Later nodes should have dependencies
    const laterNodes = nodes.slice(1);
    expect(laterNodes.some((n) => (n['dependencies'] as string[]).length > 0)).toBe(true);
  });
});

describe('ResearcherAgent', () => {
  it('should initialize with correct role', () => {
    const agent = new ResearcherAgent();
    expect(agent.id).toBe('researcher-agent');
    expect(agent.role).toBe('researcher');
    expect(agent.tools.has('research-retrieve')).toBe(true);
  });

  it('should retrieve evidence when executed', async () => {
    const agent = new ResearcherAgent();
    const result = await agent.execute(makeContext({ indexId: 'docs-index' }), 'What is machine learning?');

    expect(result.success).toBe(true);

    const retrieveCall = result.toolCalls.find((tc) => tc.toolName === 'research-retrieve');
    expect(retrieveCall).toBeDefined();
    expect(retrieveCall!.status).toBe('success');

    const output = retrieveCall!.output as Record<string, unknown>;
    expect(Array.isArray(output['evidence'])).toBe(true);
    expect(Array.isArray(output['retrievedChunkIds'])).toBe(true);
    expect(output['totalRetrieved']).toBeGreaterThan(0);
  });
});

describe('CriticAgent', () => {
  it('should initialize with correct role', () => {
    const agent = new CriticAgent();
    expect(agent.id).toBe('critic-agent');
    expect(agent.role).toBe('critic');
    expect(agent.tools.has('critique-evidence')).toBe(true);
  });

  it('should produce a critique report', async () => {
    const agent = new CriticAgent();
    const evidenceInput = JSON.stringify({
      evidence: [
        {
          evidenceId: 'e-1',
          sourceAgentId: 'researcher-agent',
          content: 'Machine learning is a subset of AI.',
          sources: ['chunk-1'],
          confidence: 0.9,
          collectedAt: Date.now(),
        },
      ],
    });

    const result = await agent.execute(makeContext(), evidenceInput);

    expect(result.success).toBe(true);
    const critiqueCall = result.toolCalls.find((tc) => tc.toolName === 'critique-evidence');
    expect(critiqueCall).toBeDefined();
    const output = critiqueCall!.output as Record<string, unknown>;
    expect(typeof output['qualityScore']).toBe('number');
    expect(Array.isArray(output['gaps'])).toBe(true);
    expect(Array.isArray(output['approvedEvidence'])).toBe(true);
  });

  it('should flag empty evidence as a gap', async () => {
    const agent = new CriticAgent();
    const result = await agent.execute(makeContext(), JSON.stringify({ evidence: [] }));

    const critiqueCall = result.toolCalls.find((tc) => tc.toolName === 'critique-evidence');
    const output = critiqueCall!.output as Record<string, unknown>;
    expect(output['qualityScore']).toBeLessThan(0.5);
    expect((output['gaps'] as string[]).length).toBeGreaterThan(0);
  });
});

describe('SynthesizerAgent', () => {
  it('should initialize with correct role', () => {
    const agent = new SynthesizerAgent();
    expect(agent.id).toBe('synthesizer-agent');
    expect(agent.role).toBe('synthesizer');
    expect(agent.tools.has('synthesize-answer')).toBe(true);
  });

  it('should produce a grounded answer from evidence', async () => {
    const agent = new SynthesizerAgent();
    const input = JSON.stringify({
      approvedEvidence: [
        {
          evidenceId: 'e-1',
          sourceAgentId: 'researcher-agent',
          content: 'Neural networks are the foundation of deep learning.',
          sources: ['chunk-1', 'chunk-2'],
          confidence: 0.92,
          collectedAt: Date.now(),
        },
      ],
      qualityScore: 0.85,
    });

    const result = await agent.execute(makeContext(), input);

    expect(result.success).toBe(true);
    const synthCall = result.toolCalls.find((tc) => tc.toolName === 'synthesize-answer');
    expect(synthCall).toBeDefined();
    const output = synthCall!.output as Record<string, unknown>;
    expect(typeof output['answer']).toBe('string');
    expect(Array.isArray(output['sources'])).toBe(true);
    expect(typeof output['groundingScore']).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// MultiAgentRunner
// ---------------------------------------------------------------------------

describe('MultiAgentRunner', () => {
  it('should run the full pipeline and return a trace', async () => {
    const runner = new MultiAgentRunner({ devMode: true });
    const trace = await runner.run('What is deep learning?', makeContext({ devMode: true }));

    expect(trace.traceId).toBeTruthy();
    expect(trace.sessionId).toBe('test-session');
    expect(trace.query).toBe('What is deep learning?');
    expect(trace.startedAt).toBeGreaterThan(0);
    expect(trace.completedAt).toBeGreaterThanOrEqual(trace.startedAt);
    expect(trace.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('should involve all four specialized agents', async () => {
    const runner = new MultiAgentRunner({ devMode: true });
    const trace = await runner.run('Explain neural networks', makeContext({ devMode: true }));

    const agentIds = trace.agents.map((a) => a.agentId);
    expect(agentIds).toContain('planner-agent');
    expect(agentIds).toContain('researcher-agent');
    expect(agentIds).toContain('critic-agent');
    expect(agentIds).toContain('synthesizer-agent');
  });

  it('should create three handoffs (planner→researcher, researcher→critic, critic→synthesizer)', async () => {
    const runner = new MultiAgentRunner({ devMode: false });
    const trace = await runner.run('What is NLP?', makeContext({ devMode: false }));

    expect(trace.handoffs).toHaveLength(3);
    expect(trace.handoffs[0].fromAgentName).toBe('Planner Agent');
    expect(trace.handoffs[0].toAgentName).toBe('Researcher Agent');
    expect(trace.handoffs[1].fromAgentName).toBe('Researcher Agent');
    expect(trace.handoffs[1].toAgentName).toBe('Critic Agent');
    expect(trace.handoffs[2].fromAgentName).toBe('Critic Agent');
    expect(trace.handoffs[2].toAgentName).toBe('Synthesizer Agent');
  });

  it('should record agent decisions', async () => {
    const runner = new MultiAgentRunner({ devMode: false });
    const trace = await runner.run('Explain transformers', makeContext());

    expect(trace.decisions.length).toBeGreaterThan(0);
    trace.decisions.forEach((d) => {
      expect(d.decisionId).toBeTruthy();
      expect(d.agentId).toBeTruthy();
      expect(d.description).toBeTruthy();
      expect(d.timestamp).toBeGreaterThan(0);
    });
  });

  it('should collect evidence across agents', async () => {
    const runner = new MultiAgentRunner({ devMode: false });
    const trace = await runner.run('What is supervised learning?', makeContext());

    expect(trace.evidence.length).toBeGreaterThan(0);
    trace.evidence.forEach((e) => {
      expect(e.evidenceId).toBeTruthy();
      expect(e.sourceAgentId).toBeTruthy();
      expect(typeof e.confidence).toBe('number');
    });
  });

  it('should include dev mode trace when devMode=true', async () => {
    const runner = new MultiAgentRunner({ devMode: true });
    const trace = await runner.run('Test query', makeContext({ devMode: true }));

    expect(trace.devMode).toBeDefined();
    expect(Array.isArray(trace.devMode!.agents)).toBe(true);
    expect(Array.isArray(trace.devMode!.handoffs)).toBe(true);
    expect(Array.isArray(trace.devMode!.decisions)).toBe(true);
    expect(Array.isArray(trace.devMode!.criticalGaps)).toBe(true);
    expect(Array.isArray(trace.devMode!.evidenceSummary)).toBe(true);
  });

  it('should omit dev mode trace when devMode=false', async () => {
    const runner = new MultiAgentRunner({ devMode: false });
    const trace = await runner.run('No dev mode', makeContext({ devMode: false }));

    expect(trace.devMode).toBeUndefined();
  });

  it('should have serializable handoffs (HandoffEnvelope)', async () => {
    const runner = new MultiAgentRunner({ devMode: false });
    const trace = await runner.run('Serialize test', makeContext());

    for (const handoff of trace.handoffs) {
      const envelope = createHandoffEnvelope(handoff);
      expect(envelope.envelopeId).toBeTruthy();
      expect(envelope.protocolVersion).toBe('1.0');
      expect(envelope.serializedAt).toBeGreaterThan(0);
      expect(envelope.handoff.handoffId).toBe(handoff.handoffId);

      // Verify it can be serialized to JSON
      const serialized = JSON.stringify(envelope);
      const deserialized = JSON.parse(serialized);
      expect(deserialized.handoff.handoffId).toBe(handoff.handoffId);
    }
  });

  it('should have correct handoff status after pipeline completes', async () => {
    const runner = new MultiAgentRunner({ devMode: false });
    const trace = await runner.run('Status test', makeContext());

    const completedHandoffs = trace.handoffs.filter((h) => h.status === 'completed');
    expect(completedHandoffs.length).toBeGreaterThan(0);
  });
});
