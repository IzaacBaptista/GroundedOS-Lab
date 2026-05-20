import type { Agent, AgentExecutionContext, Tool } from "@groundedos/agents";

export function makeFakeTool(name: string, returnValue: unknown): Tool {
  return {
    name,
    description: `Fake tool: ${name}`,
    inputSchema: {},
    call: async () => returnValue,
  };
}

export function makeSpyTool(name: string): Tool & {
  calls: Array<{ input: Record<string, unknown>; timestamp: number }>;
} {
  const calls: Array<{ input: Record<string, unknown>; timestamp: number }> = [];
  return {
    name,
    description: `Spy tool: ${name}`,
    inputSchema: {},
    calls,
    call: async (input) => {
      calls.push({ input, timestamp: Date.now() });
      return { ok: true };
    },
  };
}

export function makeTestExecutionContext(
  overrides: Partial<AgentExecutionContext> = {}
): AgentExecutionContext {
  return {
    sessionId: overrides.sessionId ?? "test-session",
    userId: overrides.userId ?? "test-user",
    indexId: overrides.indexId,
    maxSteps: overrides.maxSteps ?? 8,
    timeout: overrides.timeout ?? 30_000,
    devMode: overrides.devMode ?? true,
  };
}

export function makeSpyAgent<T extends Agent>(
  agent: T
): T & {
  executionTrace: Array<{ input: string; context: AgentExecutionContext; startedAt: number }>;
} {
  const executionTrace: Array<{
    input: string;
    context: AgentExecutionContext;
    startedAt: number;
  }> = [];
  const originalExecute = agent.execute.bind(agent);

  return Object.assign(agent, {
    executionTrace,
    async execute(context: AgentExecutionContext, input: string) {
      executionTrace.push({ input, context, startedAt: Date.now() });
      return await originalExecute(context, input);
    },
  });
}
