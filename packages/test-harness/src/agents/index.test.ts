import { describe, expect, it, vi } from "vitest";
import type { Agent, AgentExecutionContext, AgentResult, AgentState } from "@groundedos/agents";
import { makeFakeTool, makeSpyAgent, makeTestExecutionContext } from "./index";

describe("agent harness helpers", () => {
  it("creates fake tool and returns mocked value", async () => {
    const tool = makeFakeTool("tool-a", { ok: true });
    await expect(tool.call({ query: "x" })).resolves.toEqual({ ok: true });
    expect(tool.name).toBe("tool-a");
    expect(tool.description).toBe("Fake tool: tool-a");
  });

  it("rejects fake tool with invalid name", () => {
    expect(() => makeFakeTool("", "value")).toThrow(
      "tool name must be a non-empty string."
    );
  });

  it("creates execution context with defaults and overrides", () => {
    const defaults = makeTestExecutionContext();
    expect(defaults).toEqual({
      sessionId: "test-session",
      userId: "test-user",
      indexId: undefined,
      maxSteps: 8,
      timeout: 30_000,
      devMode: true,
    });

    const custom = makeTestExecutionContext({
      sessionId: "session-1",
      userId: "user-1",
      indexId: "index-1",
      maxSteps: 3,
      timeout: 5_000,
      devMode: false,
    });
    expect(custom).toEqual({
      sessionId: "session-1",
      userId: "user-1",
      indexId: "index-1",
      maxSteps: 3,
      timeout: 5_000,
      devMode: false,
    });
  });

  it("enforces execution context invariants", () => {
    expect(() =>
      makeTestExecutionContext({ sessionId: "" as unknown as string })
    ).toThrow("context.sessionId must be a non-empty string.");
    expect(() =>
      makeTestExecutionContext({ userId: " " as unknown as string })
    ).toThrow("context.userId must be a non-empty string.");
    expect(() =>
      makeTestExecutionContext({ indexId: " " as unknown as string })
    ).toThrow("context.indexId must be a non-empty string.");
    expect(() =>
      makeTestExecutionContext({ maxSteps: 0 as unknown as number })
    ).toThrow("context.maxSteps must be a positive integer.");
    expect(() =>
      makeTestExecutionContext({ timeout: 0 as unknown as number })
    ).toThrow("context.timeout must be a positive number.");
    expect(() =>
      makeTestExecutionContext({ devMode: "yes" as unknown as boolean })
    ).toThrow("context.devMode must be a boolean.");
  });

  it("wraps agent execute and captures immutable trace", async () => {
    const context: AgentExecutionContext = {
      sessionId: "s1",
      userId: "u1",
      indexId: "i1",
      maxSteps: 2,
      timeout: 1_000,
      devMode: true,
    };

    const result: AgentResult = {
      success: true,
      answer: "ok",
      reasoning: [],
      sources: [],
      toolCalls: [],
      durationMs: 1,
      state: {
        sessionId: "s1",
        agentId: "agent-1",
        agentName: "Agent 1",
        goal: "Goal",
        state: "done",
        messages: [],
        currentStep: 0,
        maxSteps: 2,
        reasoning: [],
        toolCalls: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    };

    const execute = vi.fn(async () => result);
    const agent: Agent = {
      id: "agent-1",
      name: "Agent 1",
      description: "test",
      goal: "Goal",
      tools: new Map(),
      execute,
      registerTool: vi.fn(),
      deregisterTool: vi.fn(),
      getState: vi.fn(() => result.state),
    };

    const spy = makeSpyAgent(agent);
    await expect(spy.execute(context, "hello")).resolves.toBe(result);

    context.sessionId = "mutated";
    expect(spy.executionTrace).toHaveLength(1);
    expect(spy.executionTrace[0]?.input).toBe("hello");
    expect(spy.executionTrace[0]?.context.sessionId).toBe("s1");
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "mutated" }),
      "hello"
    );
  });

  it("enforces spy agent invariants", async () => {
    expect(() => makeSpyAgent(null as unknown as Agent)).toThrow(
      "Agent must be a valid object."
    );
    expect(() =>
      makeSpyAgent({ id: "a" } as unknown as Agent)
    ).toThrow("Agent must expose an execute(context, input) function.");

    const doneState: AgentState = {
      sessionId: "s2",
      agentId: "agent-2",
      agentName: "Agent 2",
      goal: "Goal",
      state: "done",
      messages: [],
      currentStep: 0,
      maxSteps: 1,
      reasoning: [],
      toolCalls: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const idleState: AgentState = {
      ...doneState,
      state: "idle",
    };

    const baseResult: AgentResult = {
      success: true,
      reasoning: [],
      sources: [],
      toolCalls: [],
      state: doneState,
      durationMs: 0,
    };

    const base: Agent = {
      id: "agent-2",
      name: "Agent 2",
      description: "test",
      goal: "Goal",
      tools: new Map(),
      execute: vi.fn(async () => baseResult),
      registerTool: vi.fn(),
      deregisterTool: vi.fn(),
      getState: vi.fn(() => idleState),
    };

    const wrapped = makeSpyAgent(base);
    expect(() => makeSpyAgent(wrapped)).toThrow(
      "Cannot wrap agent with makeSpyAgent more than once."
    );

    await expect(
      wrapped.execute({} as AgentExecutionContext, "input")
    ).rejects.toThrow("context.sessionId must be a non-empty string.");
    await expect(
      wrapped.execute(makeTestExecutionContext(), 1 as unknown as string)
    ).rejects.toThrow("Agent input must be a string.");
  });
});
