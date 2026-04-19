# Planning

## What it is

**Planning** is the process of decomposing a goal into steps, selecting actions and updating the approach as new information arrives.

## Why it matters

Autonomous AI systems need planning to move beyond single-turn answers. GroundedOS Lab keeps planning tied to observable agent state, tool calls, memory and safety checks so plans can be inspected and corrected.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/agents`](../../packages/agents/README.md) | Owns agent goals, execution loops and delegation. |
| [`packages/memory`](../../packages/memory/README.md) | Stores task state across planning steps. |
| [`packages/safety`](../../packages/safety/README.md) | Constrains plans that could trigger unsafe actions. |
| [`packages/observability`](../../packages/observability/README.md) | Traces plan steps, tool calls and revisions. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Autonomy vs control** | More planning freedom requires stronger guardrails and review. |
| **Long-horizon drift** | Multi-step plans can move away from the original user goal. |
| **State management** | Plans need clear checkpoints, failure handling and memory updates. |
