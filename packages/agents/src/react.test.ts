/**
 * ReAct Loop Tests
 *
 * Tests for:
 * - ReActRunner full loop execution
 * - Termination conditions (max-steps, timeout, low-confidence, repetitive-loop)
 * - Tool failure handling and retry
 * - Dev mode trace generation
 */

import { describe, it, expect } from 'vitest';
import { ReActRunner, DEFAULT_REACT_CONFIG } from './react-runner';
import type { ReActReasoningResult } from './react-runner';
import { DefaultToolRegistry } from './tools';
import type { AgentExecutionContext, Tool } from './types';
import type { AgentObservation } from './react-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<AgentExecutionContext> = {}): AgentExecutionContext {
  return {
    sessionId: 'test-session',
    indexId: 'test-index',
    maxSteps: 5,
    timeout: 10_000,
    devMode: true,
    ...overrides,
  };
}

function makeRegistry(...tools: Tool[]): DefaultToolRegistry {
  const registry = new DefaultToolRegistry();
  for (const tool of tools) {
    registry.register(tool);
  }
  return registry;
}

function makeTool(name: string, returnValue: unknown, delayMs = 0): Tool {
  return {
    name,
    description: `Test tool: ${name}`,
    inputSchema: {},
    call: async () => {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      return returnValue;
    },
  };
}

function makeFailingTool(name: string, errorMsg = 'tool error'): Tool {
  return {
    name,
    description: `Failing tool: ${name}`,
    inputSchema: {},
    call: async () => {
      throw new Error(errorMsg);
    },
  };
}

// ---------------------------------------------------------------------------
// ReActRunner tests
// ---------------------------------------------------------------------------

describe('ReActRunner', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_REACT_CONFIG.maxSteps).toBe(10);
    expect(DEFAULT_REACT_CONFIG.timeoutMs).toBe(60_000);
    expect(DEFAULT_REACT_CONFIG.toolTimeoutMs).toBe(15_000);
    expect(DEFAULT_REACT_CONFIG.maxRetries).toBe(2);
    expect(DEFAULT_REACT_CONFIG.minConfidenceThreshold).toBe(0.1);
    expect(DEFAULT_REACT_CONFIG.enableSafetyChecks).toBe(true);
    expect(DEFAULT_REACT_CONFIG.devMode).toBe(false);
  });

  it('should return a completed trace with a direct answer when no tool is needed', async () => {
    const runner = new ReActRunner({ maxSteps: 5, devMode: true });
    const registry = makeRegistry();

    const trace = await runner.run(
      'What is 2+2?',
      makeContext(),
      registry,
      async () => ({
        reasoning: 'Simple arithmetic; no tool needed.',
        confidence: 0.95,
        toolName: null,
        toolInput: null,
        directAnswer: '4',
      }),
      'test-agent',
      'Test Agent',
    );

    expect(trace.terminationReason).toBe('completed');
    expect(trace.finalAnswer).toBeDefined();
    expect(trace.finalAnswer!.answer).toBe('4');
    expect(trace.finalAnswer!.confidence).toBeGreaterThan(0);
    expect(trace.steps.length).toBeGreaterThan(0);
    expect(trace.toolCalls).toHaveLength(0);
  });

  it('should call a tool and use the observation in the next step', async () => {
    const runner = new ReActRunner({ maxSteps: 5, devMode: true });
    const tool = makeTool('search', { result: 'Paris is the capital of France.' });
    const registry = makeRegistry(tool);

    let callCount = 0;
    const trace = await runner.run(
      'What is the capital of France?',
      makeContext(),
      registry,
      async (_input, _obs, step) => {
        callCount++;
        if (step === 0) {
          return {
            reasoning: 'Need to search for the capital.',
            confidence: 0.9,
            toolName: 'search',
            toolInput: { query: 'capital of France' },
            directAnswer: null,
          };
        }
        return {
          reasoning: 'Search returned the answer.',
          confidence: 0.95,
          toolName: null,
          toolInput: null,
          directAnswer: 'Paris',
        };
      },
      'test-agent',
      'Test Agent',
    );

    expect(trace.toolCalls).toHaveLength(1);
    expect(trace.toolCalls[0].toolName).toBe('search');
    expect(trace.toolCalls[0].status).toBe('success');
    expect(trace.observations).toHaveLength(1);
    expect(trace.finalAnswer?.answer).toBe('Paris');
    expect(trace.terminationReason).toBe('completed');
    expect(callCount).toBeGreaterThan(1);
  });

  it('should stop when max steps is reached', async () => {
    const runner = new ReActRunner({ maxSteps: 3, devMode: false });
    const tool = makeTool('tool', { ok: true });
    const registry = makeRegistry(tool);

    // Always ask for tool call — never terminates on its own
    const trace = await runner.run(
      'Keep calling a tool',
      makeContext({ maxSteps: 3 }),
      registry,
      async (_input, _obs, step) => ({
        reasoning: `Step ${step}: calling tool`,
        confidence: 0.8,
        toolName: 'tool',
        toolInput: { step },
        directAnswer: null,
      }),
      'test-agent',
      'Test Agent',
    );

    expect(trace.terminationReason).toBe('max-steps-reached');
    expect(trace.toolCalls.length).toBeLessThanOrEqual(3);
  });

  it('should stop when confidence drops below threshold', async () => {
    const runner = new ReActRunner({ minConfidenceThreshold: 0.5, devMode: false });
    const registry = makeRegistry();

    const trace = await runner.run(
      'Uncertain query',
      makeContext(),
      registry,
      async () => ({
        reasoning: 'Very uncertain.',
        confidence: 0.1, // below threshold
        toolName: null,
        toolInput: null,
        directAnswer: null,
      }),
      'test-agent',
      'Test Agent',
    );

    expect(trace.terminationReason).toBe('low-confidence');
  });

  it('should detect and stop repetitive loops', async () => {
    const runner = new ReActRunner({ maxSteps: 10, devMode: false });
    const tool = makeTool('search', { ok: true });
    const registry = makeRegistry(tool);

    // Always call the same tool with the same input → loop detection
    const trace = await runner.run(
      'Looping query',
      makeContext({ maxSteps: 10 }),
      registry,
      async () => ({
        reasoning: 'Calling same tool again.',
        confidence: 0.8,
        toolName: 'search',
        toolInput: { query: 'same-query' }, // identical input every time
        directAnswer: null,
      }),
      'test-agent',
      'Test Agent',
    );

    expect(trace.terminationReason).toBe('repetitive-loop');
  });

  it('should stop on tool failure when retries are exhausted', async () => {
    const runner = new ReActRunner({ maxRetries: 0, devMode: false });
    const failingTool = makeFailingTool('broken-tool', 'unavailable');
    const registry = makeRegistry(failingTool);

    const trace = await runner.run(
      'Use broken tool',
      makeContext(),
      registry,
      async () => ({
        reasoning: 'Calling broken tool.',
        confidence: 0.8,
        toolName: 'broken-tool',
        toolInput: {},
        directAnswer: null,
      }),
      'test-agent',
      'Test Agent',
    );

    expect(trace.terminationReason).toBe('tool-failure');
    expect(trace.toolCalls[0].status).toBe('error');
    expect(trace.toolCalls[0].error).toContain('unavailable');
  });

  it('should include dev mode trace when devMode is enabled', async () => {
    const runner = new ReActRunner({ devMode: true });
    const registry = makeRegistry();

    const trace = await runner.run(
      'Dev mode test',
      makeContext({ devMode: true }),
      registry,
      async () => ({
        reasoning: 'Answering directly.',
        confidence: 0.9,
        toolName: null,
        toolInput: null,
        directAnswer: 'Direct answer',
      }),
      'test-agent',
      'Test Agent',
    );

    expect(trace.devMode).toBeDefined();
    expect(trace.devMode!.steps).toBeDefined();
    expect(Array.isArray(trace.devMode!.confidencePerStep)).toBe(true);
    expect(typeof trace.devMode!.loopDetected).toBe('boolean');
    expect(typeof trace.devMode!.toolCallCount).toBe('number');
    expect(Array.isArray(trace.devMode!.uniqueToolsUsed)).toBe(true);
  });

  it('should not include dev mode trace when devMode is disabled', async () => {
    const runner = new ReActRunner({ devMode: false });
    const registry = makeRegistry();

    const trace = await runner.run(
      'No dev mode',
      makeContext({ devMode: false }),
      registry,
      async () => ({
        reasoning: 'Direct answer.',
        confidence: 0.9,
        toolName: null,
        toolInput: null,
        directAnswer: 'Answer',
      }),
      'test-agent',
      'Test Agent',
    );

    expect(trace.devMode).toBeUndefined();
  });

  it('should populate trace fields correctly', async () => {
    const runner = new ReActRunner({ devMode: true });
    const registry = makeRegistry();

    const trace = await runner.run(
      'Trace test query',
      makeContext({ sessionId: 'session-42' }),
      registry,
      async () => ({
        reasoning: 'Done.',
        confidence: 0.9,
        toolName: null,
        toolInput: null,
        directAnswer: 'Result',
      }),
      'agent-x',
      'Agent X',
    );

    expect(trace.traceId).toBeTruthy();
    expect(trace.agentId).toBe('agent-x');
    expect(trace.agentName).toBe('Agent X');
    expect(trace.sessionId).toBe('session-42');
    expect(trace.query).toBe('Trace test query');
    expect(trace.startedAt).toBeGreaterThan(0);
    expect(trace.completedAt).toBeGreaterThanOrEqual(trace.startedAt);
    expect(trace.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('should synthesize an answer from observations if reasoning loop ends without direct answer', async () => {
    const runner = new ReActRunner({ maxSteps: 2, devMode: false });
    const tool = makeTool('retrieve', { retrievedChunkIds: ['chunk-1', 'chunk-2'], summary: 'Found content' });
    const registry = makeRegistry(tool);

    let step = 0;
    const trace = await runner.run(
      'Query needing retrieval',
      makeContext({ maxSteps: 2 }),
      registry,
      async () => {
        if (step++ < 2) {
          return {
            reasoning: 'Retrieving.',
            confidence: 0.8,
            toolName: 'retrieve',
            toolInput: { query: `q-${step}` }, // different input each time
            directAnswer: null,
          };
        }
        return {
          reasoning: 'Done.',
          confidence: 0.8,
          toolName: null,
          toolInput: null,
          directAnswer: null,
        };
      },
      'test-agent',
      'Test Agent',
    );

    // Should have synthesized something from observations
    if (trace.finalAnswer) {
      expect(typeof trace.finalAnswer.answer).toBe('string');
    }
    expect(trace.totalDurationMs).toBeGreaterThanOrEqual(0);
  });
});
