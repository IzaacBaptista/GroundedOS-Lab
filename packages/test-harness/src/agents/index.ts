import type { Agent, AgentExecutionContext, Tool } from "@groundedos/agents";

const SPY_AGENT_MARKER = Symbol("test-harness:spy-agent");

export function makeFakeTool(name: string, returnValue: unknown): Tool {
  assertNonEmptyString(name, "tool name");
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
  const context: AgentExecutionContext = {
    sessionId: overrides.sessionId ?? "test-session",
    userId: overrides.userId ?? "test-user",
    indexId: overrides.indexId,
    maxSteps: overrides.maxSteps ?? 8,
    timeout: overrides.timeout ?? 30_000,
    devMode: overrides.devMode ?? true,
  };

  assertExecutionContext(context);
  return context;
}

export function makeSpyAgent<T extends Agent>(
  agent: T
): T & {
  executionTrace: Array<{ input: string; context: AgentExecutionContext; startedAt: number }>;
} {
  assertAgent(agent);
  if (isSpyAgent(agent)) {
    throw new Error("Cannot wrap agent with makeSpyAgent more than once.");
  }

  const executionTrace: Array<{
    input: string;
    context: AgentExecutionContext;
    startedAt: number;
  }> = [];
  const originalExecute = agent.execute.bind(agent);

  return Object.assign(agent, {
    executionTrace,
    async execute(context: AgentExecutionContext, input: string) {
      assertExecutionContext(context);
      if (typeof input !== "string") {
        throw new Error("Agent input must be a string.");
      }
      executionTrace.push({
        input,
        context: {
          sessionId: context.sessionId,
          userId: context.userId,
          indexId: context.indexId,
          maxSteps: context.maxSteps,
          timeout: context.timeout,
          devMode: context.devMode,
        },
        startedAt: Date.now(),
      });
      return await originalExecute(context, input);
    },
    [SPY_AGENT_MARKER]: true,
  });
}

function assertExecutionContext(context: AgentExecutionContext): void {
  assertNonEmptyString(context.sessionId, "context.sessionId");
  assertOptionalNonEmptyString(context.userId, "context.userId");
  assertOptionalNonEmptyString(context.indexId, "context.indexId");

  if (!Number.isInteger(context.maxSteps) || context.maxSteps <= 0) {
    throw new Error("context.maxSteps must be a positive integer.");
  }

  if (!Number.isFinite(context.timeout) || context.timeout <= 0) {
    throw new Error("context.timeout must be a positive number.");
  }

  if (typeof context.devMode !== "boolean") {
    throw new Error("context.devMode must be a boolean.");
  }
}

function assertAgent(agent: unknown): asserts agent is Agent {
  if (!agent || typeof agent !== "object") {
    throw new Error("Agent must be a valid object.");
  }

  if (typeof (agent as Agent).execute !== "function") {
    throw new Error("Agent must expose an execute(context, input) function.");
  }
}

function isSpyAgent(agent: Agent): boolean {
  return Boolean((agent as Agent & { [SPY_AGENT_MARKER]?: true })[SPY_AGENT_MARKER]);
}

function assertNonEmptyString(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}

function assertOptionalNonEmptyString(
  value: string | undefined,
  fieldName: string
): void {
  if (value !== undefined) {
    assertNonEmptyString(value, fieldName);
  }
}
