/**
 * Planning Tests
 *
 * Tests for:
 * - PlanCritic evaluation
 * - PlanExecutor step-by-step execution
 * - Plan-and-execute with replanning
 * - Early termination and cost limits
 * - Topological execution order
 */

import { describe, it, expect, vi } from 'vitest';
import { PlanCritic, PlanExecutor } from './plan-executor';
import { PlannerAgent } from './specialized-agents';
import type { TaskPlan, PlanNode } from './planning-types';
import { DEFAULT_PLANNING_STRATEGY } from './planning-types';
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

function makePlan(nodes: Partial<PlanNode>[], objective = 'Test objective'): TaskPlan {
  const now = Date.now();
  const fullNodes: PlanNode[] = nodes.map((n, idx) => ({
    nodeId: n.nodeId ?? `node-${idx + 1}`,
    label: n.label ?? `Task ${idx + 1}`,
    description: n.description ?? `Description for task ${idx + 1}`,
    dependencies: n.dependencies ?? (idx === 0 ? [] : [`node-${idx}`]),
    status: n.status ?? 'pending',
    requiredTools: n.requiredTools ?? [],
    successCriteria: n.successCriteria ?? ['Task completed'],
    risks: n.risks ?? [],
    expectedOutput: n.expectedOutput ?? 'Output',
  }));

  return {
    planId: 'plan-test-1',
    objective,
    nodes: fullNodes,
    edges: fullNodes
      .filter((n) => n.dependencies.length > 0)
      .map((n) => ({
        edgeId: `edge-${n.nodeId}`,
        from: n.dependencies[0],
        to: n.nodeId,
        isDependency: true,
      })),
    successCriteria: ['All tasks completed'],
    risks: [],
    allRequiredTools: [],
    responsibleAgents: [],
    status: 'ready',
    strategy: DEFAULT_PLANNING_STRATEGY,
    createdAt: now,
    updatedAt: now,
    revisions: [],
  };
}

// ---------------------------------------------------------------------------
// PlanCritic tests
// ---------------------------------------------------------------------------

describe('PlanCritic', () => {
  it('should give a high score to a well-formed plan', () => {
    const critic = new PlanCritic();
    const plan = makePlan([
      { label: 'Retrieve', description: 'Get documents', successCriteria: ['Documents retrieved'] },
      { label: 'Analyze', description: 'Analyze content', successCriteria: ['Analysis complete'] },
      { label: 'Summarize', description: 'Write summary', successCriteria: ['Summary written'] },
    ]);

    const evaluation = critic.evaluate(plan, 'Test query');

    expect(evaluation.planId).toBe('plan-test-1');
    expect(evaluation.overallScore).toBeGreaterThan(0.7);
    expect(evaluation.completenessScore).toBeGreaterThan(0.7);
    expect(evaluation.feasibilityScore).toBeGreaterThan(0.7);
    expect(evaluation.evaluatedAt).toBeGreaterThan(0);
  });

  it('should penalize nodes missing descriptions', () => {
    const critic = new PlanCritic();
    const plan = makePlan([
      { label: 'Task 1', description: '', successCriteria: ['Done'] },
    ]);

    const evaluation = critic.evaluate(plan, 'Test');
    expect(evaluation.completenessScore).toBeLessThan(1.0);
    expect(evaluation.issues.some((i) => i.includes('missing a description'))).toBe(true);
  });

  it('should penalize nodes missing success criteria', () => {
    const critic = new PlanCritic();
    const plan = makePlan([
      { label: 'Task 1', description: 'Some description', successCriteria: [] },
    ]);

    const evaluation = critic.evaluate(plan, 'Test');
    expect(evaluation.completenessScore).toBeLessThan(1.0);
    expect(evaluation.issues.some((i) => i.includes('no success criteria'))).toBe(true);
    expect(evaluation.suggestions.length).toBeGreaterThan(0);
  });

  it('should detect duplicate node labels', () => {
    const critic = new PlanCritic();
    const plan = makePlan([
      { nodeId: 'n1', label: 'Retrieve documents', description: 'x', successCriteria: ['done'], dependencies: [] },
      { nodeId: 'n2', label: 'Retrieve documents', description: 'y', successCriteria: ['done'], dependencies: [] },
    ]);

    const evaluation = critic.evaluate(plan, 'Test');
    expect(evaluation.issues.some((i) => i.includes('duplicate'))).toBe(true);
  });

  it('should include evaluated timestamp', () => {
    const critic = new PlanCritic();
    const before = Date.now();
    const evaluation = critic.evaluate(makePlan([{ label: 'Task', description: 'Desc', successCriteria: ['Done'] }]), 'q');
    const after = Date.now();
    expect(evaluation.evaluatedAt).toBeGreaterThanOrEqual(before);
    expect(evaluation.evaluatedAt).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// PlanExecutor tests
// ---------------------------------------------------------------------------

describe('PlanExecutor', () => {
  it('should execute all nodes of a simple plan', async () => {
    const executor = new PlanExecutor();
    const plan = makePlan([
      { nodeId: 'n1', label: 'Step 1', description: 'First step', successCriteria: ['Done'], dependencies: [] },
      { nodeId: 'n2', label: 'Step 2', description: 'Second step', successCriteria: ['Done'], dependencies: ['n1'] },
    ]);

    const executedNodes: string[] = [];

    const trace = await executor.execute(plan, makeContext(), async (node) => {
      executedNodes.push(node.nodeId);
      return { success: true, result: `Output of ${node.label}` };
    });

    expect(trace.success).toBe(true);
    expect(executedNodes).toContain('n1');
    expect(executedNodes).toContain('n2');
    // n1 must execute before n2
    expect(executedNodes.indexOf('n1')).toBeLessThan(executedNodes.indexOf('n2'));
  });

  it('should emit plan-completed event on success', async () => {
    const executor = new PlanExecutor();
    const plan = makePlan([{ nodeId: 'n1', label: 'Only step', description: 'Do it', successCriteria: ['Done'], dependencies: [] }]);

    const trace = await executor.execute(plan, makeContext(), async () => ({ success: true, result: 'ok' }));

    const completedEvent = trace.events.find((e) => e.type === 'plan-completed');
    expect(completedEvent).toBeDefined();
  });

  it('should handle a failing node and attempt replan', async () => {
    const executor = new PlanExecutor({ enableEarlyTermination: false });
    const plan = makePlan([
      { nodeId: 'n1', label: 'Fail step', description: 'Will fail', successCriteria: ['Done'], dependencies: [] },
      { nodeId: 'n2', label: 'Next step', description: 'After fail', successCriteria: ['Done'], dependencies: ['n1'] },
    ]);

    const trace = await executor.execute(plan, makeContext(), async (node) => {
      if (node.nodeId === 'n1') {
        return { success: false, error: 'Step 1 failed intentionally' };
      }
      return { success: true };
    });

    const failEvent = trace.events.find((e) => e.type === 'node-failed');
    expect(failEvent).toBeDefined();
    // Replan triggered after failure
    const replanEvent = trace.events.find((e) => e.type === 'replan-triggered');
    expect(replanEvent).toBeDefined();
    expect(trace.replanCount).toBeGreaterThan(0);
  });

  it('should skip nodes whose dependencies are not met', async () => {
    const executor = new PlanExecutor({ enableEarlyTermination: false });
    const plan = makePlan([
      { nodeId: 'n1', label: 'Root', description: 'Root step', successCriteria: ['Done'], dependencies: [] },
      { nodeId: 'n2', label: 'Dependent', description: 'Depends on n1', successCriteria: ['Done'], dependencies: ['n1'] },
    ]);

    // Force n1 to be already skipped
    plan.nodes[0].status = 'skipped';

    const executedNodes: string[] = [];
    await executor.execute(plan, makeContext(), async (node) => {
      executedNodes.push(node.nodeId);
      return { success: true };
    });

    // n2 should be skipped because n1 is not 'completed'
    expect(executedNodes).not.toContain('n2');
    const skipEvent = plan.nodes.find((n) => n.nodeId === 'n2');
    expect(skipEvent?.status).toBe('skipped');
  });

  it('should stop early when goal is achieved', async () => {
    const executor = new PlanExecutor({ enableEarlyTermination: true });
    const plan = makePlan([
      { nodeId: 'n1', label: 'Research', description: 'Research step', successCriteria: ['Done'], dependencies: [] },
      { nodeId: 'n2', label: 'Synthesize', description: 'Synthesize step', successCriteria: ['Done'], dependencies: ['n1'] },
      { nodeId: 'n3', label: 'Extra', description: 'Extra step', successCriteria: ['Done'], dependencies: ['n2'] },
    ]);

    const executedNodes: string[] = [];
    const trace = await executor.execute(plan, makeContext(), async (node) => {
      executedNodes.push(node.nodeId);
      return { success: true, result: { answer: 'Final answer' } };
    });

    const goalEvent = trace.events.find((e) => e.type === 'goal-achieved');
    expect(goalEvent).toBeDefined();
  });

  it('should record node start and completion events', async () => {
    const executor = new PlanExecutor();
    const plan = makePlan([{ nodeId: 'n1', label: 'Task', description: 'Do task', successCriteria: ['Done'], dependencies: [] }]);

    const trace = await executor.execute(plan, makeContext(), async () => ({ success: true }));

    const startEvent = trace.events.find((e) => e.type === 'node-started');
    const completedEvent = trace.events.find((e) => e.type === 'node-completed');
    expect(startEvent).toBeDefined();
    expect(completedEvent).toBeDefined();
  });

  it('should return a trace with correct metadata', async () => {
    const executor = new PlanExecutor();
    const plan = makePlan([{ nodeId: 'n1', label: 'Task', description: 'Desc', successCriteria: ['Done'], dependencies: [] }]);
    const before = Date.now();

    const trace = await executor.execute(plan, makeContext(), async () => ({ success: true }));

    expect(trace.traceId).toBeTruthy();
    expect(trace.planId).toBe('plan-test-1');
    expect(trace.objective).toBe('Test objective');
    expect(trace.startedAt).toBeGreaterThanOrEqual(before);
    expect(trace.completedAt).toBeGreaterThanOrEqual(trace.startedAt);
    expect(trace.totalDurationMs).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// PlannerAgent integration
// ---------------------------------------------------------------------------

describe('PlannerAgent integration', () => {
  it('should produce a plan that PlanCritic can evaluate', async () => {
    const plannerAgent = new PlannerAgent();
    const plannerResult = await plannerAgent.execute(makeContext(), 'Analyze climate change data');

    const planCall = plannerResult.toolCalls.find((tc) => tc.toolName === 'generate-plan');
    expect(planCall?.status).toBe('success');

    const plan = planCall!.output as TaskPlan;
    expect(plan.planId).toBeTruthy();

    const critic = new PlanCritic();
    const evaluation = critic.evaluate(plan, 'Analyze climate change data');

    expect(evaluation.overallScore).toBeGreaterThan(0);
    expect(typeof evaluation.completenessScore).toBe('number');
    expect(typeof evaluation.feasibilityScore).toBe('number');
    expect(typeof evaluation.efficiencyScore).toBe('number');
  });

  it('should produce a plan that PlanExecutor can run', async () => {
    const plannerAgent = new PlannerAgent();
    const plannerResult = await plannerAgent.execute(makeContext(), 'Write a report');

    const planCall = plannerResult.toolCalls.find((tc) => tc.toolName === 'generate-plan');
    const plan = planCall!.output as TaskPlan;

    const executor = new PlanExecutor();
    const trace = await executor.execute(plan, makeContext(), async (node) => ({
      success: true,
      result: `Completed: ${node.label}`,
    }));

    expect(trace.traceId).toBeTruthy();
    expect(trace.events.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// API schema tests
// ---------------------------------------------------------------------------

describe('Agent API schemas', () => {
  it('should export new schemas from @groundedos/core', async () => {
    const core = await import('../../core/src/index');
    expect(core.AgentReActRequestSchema).toBeDefined();
    expect(core.AgentReActResponseSchema).toBeDefined();
    expect(core.AgentMultiRequestSchema).toBeDefined();
    expect(core.AgentMultiResponseSchema).toBeDefined();
    expect(core.AgentPlanRequestSchema).toBeDefined();
    expect(core.AgentPlanResponseSchema).toBeDefined();
  });

  it('should validate a valid ReAct request', async () => {
    const { AgentReActRequestSchema } = await import('../../core/src/index');
    const result = AgentReActRequestSchema.safeParse({
      query: 'What is AI?',
      indexId: 'my-index',
      maxSteps: 8,
      devMode: true,
    });
    expect(result.success).toBe(true);
  });

  it('should reject a ReAct request with empty query', async () => {
    const { AgentReActRequestSchema } = await import('../../core/src/index');
    const result = AgentReActRequestSchema.safeParse({ query: '' });
    expect(result.success).toBe(false);
  });

  it('should validate a valid multi-agent request', async () => {
    const { AgentMultiRequestSchema } = await import('../../core/src/index');
    const result = AgentMultiRequestSchema.safeParse({
      query: 'Explain deep learning',
      devMode: true,
    });
    expect(result.success).toBe(true);
  });

  it('should validate a valid plan request', async () => {
    const { AgentPlanRequestSchema } = await import('../../core/src/index');
    const result = AgentPlanRequestSchema.safeParse({
      query: 'Research renewable energy',
      planningStrategy: 'plan-and-execute',
      maxSteps: 16,
      devMode: false,
    });
    expect(result.success).toBe(true);
  });

  it('should reject a plan request with unknown planningStrategy', async () => {
    const { AgentPlanRequestSchema } = await import('../../core/src/index');
    const result = AgentPlanRequestSchema.safeParse({
      query: 'Test',
      planningStrategy: 'unknown-strategy',
    });
    expect(result.success).toBe(false);
  });

  it('should reject requests with extra unknown fields (strict mode)', async () => {
    const { AgentReActRequestSchema } = await import('../../core/src/index');
    const result = AgentReActRequestSchema.safeParse({
      query: 'Test',
      unknownField: 'should be rejected',
    });
    expect(result.success).toBe(false);
  });
});
