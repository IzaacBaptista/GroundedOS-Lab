# agents

Multi-agent orchestration layer. Coordinates specialized agents and tool-calling to solve complex tasks.

## Responsibilities

- Define agent roles, goals and execution loops
- Implement tool calling and function calling interfaces
- Orchestrate inter-agent communication and delegation
- Manage agent state and intermediate reasoning steps
- Support self-reflection and self-correction flows

## Status

Complete (Phase 3 baseline); hardening in progress (Phase 8 — see
[ADR-015](../../docs/adr/ADR-015-multi-agent-orchestration-strategy.md))

## Current implementation

- `BaseAgent` provides lifecycle state, reasoning-step tracking and a tool-calling loop.
- `DocumentQAAgent` answers questions grounded in document content via `POST /agents/execute` (`agentType: "document-qa"`).
- `ReActRunner` implements the full Thought→Action→Observation loop (retry, timeout, repetitive-loop detection) via `POST /agents/react`.
- `MultiAgentRunner` coordinates a fixed `PlannerAgent → ResearcherAgent → CriticAgent → SynthesizerAgent` pipeline with an explicit handoff protocol (`AgentHandoff`, `HandoffEnvelope`) via `POST /agents/multi`.
- `PlanExecutor` + `PlanCritic` run long-horizon `TaskPlan` execution with dependency-aware scheduling, replanning and early termination via `POST /agents/plan`.
- `DefaultToolRegistry` registers and resolves tools by name.
- `executeTool()` runs tools with timeout handling and structured errors.
- Four API endpoints in total: `POST /agents/execute`, `POST /agents/react`, `POST /agents/multi`, `POST /agents/plan`.

## Current limits

- Reasoning is deterministic and heuristic-driven across all four agent
  paths (Planner/Researcher/Critic/Synthesizer included); no agent calls an
  LLM yet. Replacing this with LLM-backed reasoning is deliberately out of
  scope for Phase 8 (see ADR-015) and tracked as separate future work.
- Tool execution is in-process; queue-backed worker execution is still planned.
- No guardrail (`@groundedos/safety`) or eval (`@groundedos/evals`)
  integration on any of the four endpoints yet — Phase 8 hardening work.
  `DocumentQAAgent`'s `retrieve-from-index` tool is currently a fully mocked
  simulation, not a real call into `@groundedos/rag`.
