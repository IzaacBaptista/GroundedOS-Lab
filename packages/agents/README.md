# agents

Multi-agent orchestration layer. Coordinates specialized agents and tool-calling to solve complex tasks.

## Responsibilities

- Define agent roles, goals and execution loops
- Implement tool calling and function calling interfaces
- Orchestrate inter-agent communication and delegation
- Manage agent state and intermediate reasoning steps
- Support self-reflection and self-correction flows

## Status

Complete (Phase 3 baseline)

## Current implementation

- `BaseAgent` provides lifecycle state, reasoning-step tracking and a tool-calling loop.
- `DocumentQAAgent` is the first concrete agent for document question answering.
- `DefaultToolRegistry` registers and resolves tools by name.
- `executeTool()` runs tools with timeout handling and structured errors.
- API integration is available through `POST /agents/execute` with
  `agentType: "document-qa"`.

## Current limits

- Reasoning is deterministic and heuristic-driven; it does not call an LLM yet.
- The first agent path is document QA only.
- Tool execution is in-process; queue-backed worker execution is still planned.
