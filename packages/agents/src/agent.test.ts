
import { describe, it, expect } from 'vitest';
import { DocumentQAAgent } from './document-qa-agent';

describe('DocumentQAAgent', () => {
  it('should initialize with correct metadata', () => {
    const agent = new DocumentQAAgent();

    expect(agent.id).toBe('document-qa-agent');
    expect(agent.name).toBe('Document QA Agent');
    expect(agent.tools.size).toBe(2); // retrieve + summarize
  });

  it('should register tools by default', () => {
    const agent = new DocumentQAAgent();

    expect(agent.tools.has('retrieve-from-index')).toBe(true);
    expect(agent.tools.has('summarize-with-context')).toBe(true);
  });

  it('should execute a document QA flow end-to-end', async () => {
    const agent = new DocumentQAAgent();

    const result = await agent.execute(
      {
        sessionId: 'test-session',
        indexId: 'test-index',
        maxSteps: 5,
        timeout: 10000,
        devMode: true,
      },
      'What is this document about?',
    );

    expect(result.success).toBe(true);
    expect(result.answer).toBeDefined();
    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(result.toolCalls.length).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should handle missing index ID gracefully', async () => {
    const agent = new DocumentQAAgent();

    const result = await agent.execute(
      {
        sessionId: 'test-session',
        maxSteps: 5,
        timeout: 10000,
        devMode: true,
      },
      'What is this document about?',
    );

    expect(result.success).toBe(true);
    expect(result.answer).toContain('Error');
  });

  it('should track tool calls with timing', async () => {
    const agent = new DocumentQAAgent();

    const result = await agent.execute(
      {
        sessionId: 'test-session',
        indexId: 'test-index',
        maxSteps: 5,
        timeout: 10000,
        devMode: true,
      },
      'What is this about?',
    );

    expect(result.toolCalls.length).toBeGreaterThan(0);
    result.toolCalls.forEach((call) => {
      expect(call.id).toBeDefined();
      expect(call.toolName).toBeDefined();
      expect(call.input).toBeDefined();
      expect(call.status).toMatch(/pending|success|error/);
      expect(call.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  it('should return sources when retrieval succeeds', async () => {
    const agent = new DocumentQAAgent();

    const result = await agent.execute(
      {
        sessionId: 'test-session',
        indexId: 'test-index',
        maxSteps: 5,
        timeout: 10000,
        devMode: true,
      },
      'What is this?',
    );

    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources[0]).toMatch(/chunk-/);
  });

  it('should capture state for dev mode inspection', async () => {
    const agent = new DocumentQAAgent();

    const result = await agent.execute(
      {
        sessionId: 'test-session-123',
        indexId: 'test-index-456',
        maxSteps: 5,
        timeout: 10000,
        devMode: true,
      },
      'Test query?',
    );

    const state = result.state;
    expect(state.sessionId).toBe('test-session-123');
    expect(state.agentId).toBe('document-qa-agent');
    expect(state.state).toBe('done');
    expect(state.messages).toBeDefined();
    expect(state.reasoning).toBeDefined();
  });
});
