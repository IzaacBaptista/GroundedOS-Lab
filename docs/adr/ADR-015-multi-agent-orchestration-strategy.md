# ADR-015 — Multi-agent orchestration strategy

**Status:** Accepted (documented retroactively — see Context)

## Context

The README tagline and Objectives promise "multi-agent orchestration"
([README.md:3](../../README.md#L3)) and the Target Architecture diagram
names a "Multi-Agent Orchestration" stage
([README.md:355](../../README.md#L355)), but until now no ADR recorded which
orchestration approach was chosen. Phase 3's documented scope
([README.md:63-69](../../README.md#L63-L69)) only described `DocumentQAAgent`
with tool calling.

A repo audit for this ADR (see
[docs/planning/phase-8-audit-findings.md](../planning/phase-8-audit-findings.md))
found that a multi-agent orchestration layer was in fact already implemented
and merged to `main` in commit `e9c1ff8` ("feat(agents): implement ReAct
loop, multi-agent handoff, and long-horizon planning"), including:

- `MultiAgentRunner` (`packages/agents/src/multi-agent-runner.ts`) running a
  fixed `PlannerAgent → ResearcherAgent → CriticAgent → SynthesizerAgent`
  pipeline with an explicit handoff protocol (`AgentHandoff`,
  `HandoffContext`, `HandoffEnvelope` in `multi-agent-types.ts`).
- `PlanExecutor` / `PlanCritic` (`packages/agents/src/plan-executor.ts`) for
  long-horizon plan-and-execute with replanning.
- `ReActRunner` (`packages/agents/src/react-runner.ts`) for single-agent
  Thought→Action→Observation loops.
- API surface: `POST /agents/react`, `POST /agents/multi`, `POST
  /agents/plan` in `apps/api/src/agents/agent.controller.ts`, alongside the
  original `POST /agents/execute`.

This ADR exists to record *why this shape* was chosen, since no ADR did so
at implementation time, and to make the remaining gaps (documentation sync,
guardrail/eval wiring, heuristic-vs-LLM reasoning) explicit for follow-up
work instead of leaving them implicit in code.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **(a) Custom lightweight handoff runner** (what was built) | No new dependency; consistent with the project's local-first philosophy and with ADR-008's precedent of a custom `WorkflowRunner` over a heavier engine; full control over `AgentHandoff`/Dev Mode trace shape; every step lives in `@groundedos/agents`, easy to unit test in isolation (confirmed: 299+375+360 lines of tests exist) | Fixed 4-role pipeline is hardcoded in `MultiAgentRunner.run()` — adding a 5th role or a conditional branch requires editing the runner itself, not just registering a new agent; no built-in persistence/checkpointing for long-running graphs |
| **(b) LangGraph** | Mature graph-based orchestration, built-in state persistence/checkpointing, conditional edges, ecosystem tooling | Python-first (project is TypeScript/Node); adds a substantial dependency for a learning-lab package whose stated goal (`packages/agents/README.md`) is to teach orchestration mechanics, not delegate them to a framework; would obscure the handoff protocol the project wants to expose in Dev Mode |
| **(c) CrewAI-style role framework** (planner/executor/reviewer roles as first-class framework concept, the pattern used by Atlas's internal `agent-system`) | Named roles map directly to the Planner/Researcher/Critic/Synthesizer split already in use; role-based mental model is easy to teach | Adds a dependency and its own abstraction layer on top of `BaseAgent`, which already exists in this repo; less control over the exact `HandoffEnvelope` shape needed for the project's replay/audit goals ([docs/planning/phase-8-audit-findings.md](../planning/phase-8-audit-findings.md) notes replay is itself a tracked gap, issue #65) |

Evaluated against: local-first philosophy (no new runtime dependency, no
Python bridge), `@groundedos/agents` package boundaries (orchestration
logic should stay inside the package the rest of the monorepo already
depends on), and testability (the custom runner is exercised directly by
unit tests without mocking a third-party graph engine).

## Decision

Keep option (a), the custom lightweight handoff runner, as the accepted
architecture — it is already implemented and shipped, and re-evaluating
against (b)/(c) does not surface a strong enough reason to migrate away from
it at this project's current scale (4 fixed roles, in-process execution, no
cross-service orchestration need yet).

This ADR does **not** approve new scope. It formalizes the existing
decision and scopes what should happen next as implementation follow-up
(tracked in
[SDD-phase8-multi-agent-orchestration.md](../planning/SDD-phase8-multi-agent-orchestration.md)),
specifically:

1. Wire `@groundedos/safety` guardrails into `/agents/multi`, `/agents/react`,
   `/agents/plan` — `MultiAgentRunnerConfig.enableSafetyChecks` exists as a
   config flag but is never read (`multi-agent-runner.ts` has no safety
   import).
2. Wire `@groundedos/evals` scoring into multi-agent/plan traces.
3. Replace heuristic reasoning (`decomposeObjective()` and friends in
   `specialized-agents.ts`) with LLM-backed reasoning where the project is
   ready to add a model call — tracked as a separate, explicit decision, not
   bundled into this ADR.
4. Sync `packages/agents/README.md` and root `README.md` to describe the
   four endpoints and four agent roles that actually exist.

## Consequences

- No code changes required by this ADR alone — it documents the status quo.
- Future contributors adding a 5th agent role or a conditional handoff will
  need to edit `MultiAgentRunner.run()` directly; if that becomes frequent,
  revisit option (b)/(c) rather than growing an ad hoc branch tree in the
  runner.
- Guardrail and eval integration (item 1–2 above) become explicit,
  trackable follow-up work instead of a silent gap discovered by grep.
- Documentation updates (item 4) are tracked as Roadmap Phase 8 (see README
  block proposed in
  [docs/planning/README-roadmap-additions.md](../planning/README-roadmap-additions.md)),
  separating "orchestration exists" from "orchestration is fully hardened."

**Verification of `/agents/execute` (added after Phase 8 kickoff):** it does
**not** delegate to a real RAG service, so there is no guardrail chain to
inherit. `apps/api/src/agents/agent.service.ts:60-77` (`executeAgent()`)
constructs a bare `new DocumentQAAgent()` and never calls
`setRagService()`. `packages/agents/src/document-qa-agent.ts:22-56`'s
`retrieve-from-index` tool is fully mocked — the code comment literally
says "In real implementation, this would call into the RAG service... //
Simulate retrieval" and returns hardcoded chunk text regardless of the
query. No `@groundedos/safety` import exists anywhere in
`agent.service.ts`. This is a stronger gap than assumed at kickoff (not "no
guardrail because it's someone else's job" but "no guardrail and no real
retrieval either"). Item 3 in the Decision section above and the SDD's
Success Criteria are updated to cover `/agents/execute` explicitly rather
than assuming it inherits safety from elsewhere.

**Second correction**: the audit findings doc and SDD both assumed
`POST /rag/ask` already wires `GuardrailChain` into the request path and
that guardrail wiring for agents should "match that pattern." That
assumption was checked and is **false**: `grep -rn "GuardrailChain"
apps/api/src` matches only `apps/api/src/lab/lab.service.ts` (a Lab/
benchmark surface). `apps/api/src/rag-service.ts` has zero references to
`GuardrailChain` or `@groundedos/safety`. The only place `@groundedos/
safety` is wired into the API is `apps/api/src/safety/safety.service.ts`,
which backs a standalone `POST /safety/analyze` / `/critique` /
`/constitutional` playground (the "Guardrails Playground" feature) that a
caller invokes manually — it is not applied automatically to `/rag/ask` or
any other request path. `packages/safety/README.md`'s own "Current limits"
section already says this: "the suite is packaged and tested, but it is
not yet wired across every API request path." Phase 8's guardrail wiring
(SDD, "What changes in this phase") is therefore the **first** automatic
wiring of `GuardrailChain` into a live request path in this codebase, not
a copy of an existing pattern.
