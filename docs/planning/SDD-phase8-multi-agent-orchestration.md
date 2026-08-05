# SDD — Phase 8: Multi-Agent Orchestration (documentation sync + hardening)

Companion to [ADR-015](../adr/ADR-015-multi-agent-orchestration-strategy.md)
and [phase-8-audit-findings.md](./phase-8-audit-findings.md).

> Scope note: multi-agent orchestration (Planner/Researcher/Critic/
> Synthesizer handoffs, ReAct loop, plan-and-execute) is **already
> implemented, tested and merged** (`packages/agents/src/*`,
> `apps/api/src/agents/*`). This SDD does not design that from scratch — it
> scopes closing the gap between what's shipped and what's documented,
> safe, and evaluated.

## Goal

Bring the existing multi-agent orchestration layer up to the same
documentation, safety, and evaluation bar as the rest of the project, and
give it a real Roadmap entry.

## Success criteria (checklist format, for direct copy into README Roadmap)

- [ ] `packages/agents/README.md` "Current implementation" / "Current
      limits" sections describe all four endpoints (`execute`, `react`,
      `multi`, `plan`) and name the four specialized agent roles
      (Planner/Researcher/Critic/Synthesizer)
- [x] Numbered as a new Phase 8 (decided — Phase 3's already-shipped
      checklist is not rewritten)
- [ ] `packages/agents` depends on `@groundedos/safety` and instantiates a
      `GuardrailChain` with the six registered guardrails
- [ ] `MultiAgentRunnerConfig.enableSafetyChecks` is read and enforced:
      each handoff in `MultiAgentRunner.run()` passes through
      `GuardrailChain.check()` before the receiving agent executes
- [ ] `PlanExecutor.execute()` node results pass through the same guardrail
      chain before being marked `completed`
- [ ] `POST /agents/execute` (`DocumentQAAgent`) also passes through the
      guardrail chain — it has **no** existing safety coverage (see ADR-015
      Consequences: it doesn't delegate to a real RAG service at all, so
      there was nothing to inherit from)
- [ ] `/agents/multi` and `/agents/plan` responses include eval scores
      (faithfulness/relevance/recall) from `@groundedos/evals` — this is
      **new** wiring, not a copy of an existing pattern: `/rag/ask` itself
      does not call `GuardrailChain` today either (see ADR-015
      "Second correction")
- [ ] At least one new test asserts a guardrail-triggering handoff is
      blocked/flagged in `multi-agent.test.ts` and `planning.test.ts`
- [ ] `packages/agents/README.md` "Current implementation" / "Current
      limits" sections describe all four endpoints (`execute`, `react`,
      `multi`, `plan`) and name the four specialized agent roles
      (Planner/Researcher/Critic/Synthesizer); the heuristic/no-LLM
      limitation stays documented as-is (still true, out of scope — see
      below)

## In scope

- `packages/agents` — wiring safety/evals into `MultiAgentRunner` and
  `PlanExecutor`; no new agent roles.
- `apps/api/src/agents/agent.service.ts` — passing guardrail/eval results
  through to `AgentMultiResponse`/`AgentPlanResponse`.
- `packages/agents/README.md`, root `README.md` — documentation sync only.
- `docs/adr/README.md` index — add the ADR-015 row.

## Out of scope (explicit)

- Replacing the fixed 4-role pipeline with a dynamic/graph-based one
  (would reopen ADR-015's Options table — not needed at current scale).
- LLM-backed reasoning for Planner/Researcher/Critic/Synthesizer — flagged
  as a genuine gap in the audit, but it's a model-integration decision
  (which provider, cost, latency budget) independent of orchestration
  wiring. **Decided: out of scope for Phase 8**, deferred to its own
  ADR/phase.
- Issues #77 (Reinforcement Learning), #66 (Synthetic Evaluation
  Generation), #65 (Deterministic Replay) — unrelated systems; see
  recommendations in the reorganization proposal.
- New `packages/orchestration` package — not justified; `@groundedos/agents`
  already owns this and splitting it now has no concrete driver.
- New `/agents/*` endpoints beyond the four that already exist.

## Design

### Current shape (already implemented, not re-designed here)

```text
POST /agents/multi
  → AgentService.executeMultiAgent()
    → MultiAgentRunner.run(query, context)
      → PlannerAgent.execute()      (produces TaskPlan)
      → handoff → ResearcherAgent.execute()   (collects Evidence[])
      → handoff → CriticAgent.execute()       (approves/rejects evidence)
      → handoff → SynthesizerAgent.execute()  (final answer + citations)
    → MultiAgentTrace (Dev Mode trace when devMode=true)
```

Each handoff already carries a full `HandoffContext` (evidence, constraints,
execution limits) so the receiving agent is self-contained — this is the
piece worth preserving, not replacing.

### What changes in this phase

1. **Guardrail insertion point**: between `_createHandoff(...)` and the
   receiving agent's `.execute()` call in `MultiAgentRunner.run()`
   (`multi-agent-runner.ts:113-144`, `168-202`, `238-278`), run the handoff's
   `task` + `context.evidence` content through a `GuardrailChain` instance
   (`packages/safety/src/guardrails/index.ts`) registered with all six
   guardrails. On block: mark the handoff `status: 'rejected'` (the type
   already supports this — `multi-agent-types.ts:42-48`) and short-circuit
   with a safe fallback answer. There is no existing "RAG-path guardrail
   block" pattern to mirror (confirmed: `/rag/ask` doesn't wire
   `GuardrailChain` either) — this is a new insertion point, designed from
   the `Guardrail`/`GuardrailChain` interfaces directly.
2. **Eval insertion point**: after `finalAnswer`/`success` are set in
   `MultiAgentRunner.run()` (end of the method, before building
   `devModeTrace`), run the final answer + evidence through
   `FaithfulnessEvaluator`/`RelevanceEvaluator`/`RecallEvaluator` and attach
   scores to `MultiAgentTrace`.
3. **`PlanExecutor.execute()`**: same guardrail check inside the node-result
   handling branch (`plan-executor.ts:223-257`), gated behind
   `PlanExecutorConfig` the same way `maxCostUsd`/`maxRiskScore` already are.
4. **`POST /agents/execute` (`DocumentQAAgent`)**: also gets the guardrail
   chain, applied in `AgentService.executeAgent()` around the agent's
   `.execute()` call — it currently has zero safety coverage and its
   retrieval tool is fully mocked (see ADR-015 Consequences). Guardrail
   wiring here does not fix the mocked retrieval (out of scope — that's a
   RAG-integration gap, not a safety gap) but at minimum stops it from
   answering with un-vetted text.

### `GuardrailChain` setup

`packages/agents` gains a new dependency on `@groundedos/safety`. A shared
helper (e.g. `packages/agents/src/guardrail-setup.ts`) builds one
`GuardrailChain` with `PromptInjectionGuardrail`, `PIILeakageGuardrail`,
`JailbreakGuardrail`, `HallucinationGuardrail`, `PromptLeakageGuardrail`,
`IndirectInjectionGuardrail` registered, reused by `MultiAgentRunner`,
`PlanExecutor`, and `AgentService`.

## Integration with `@groundedos/evals` and `@groundedos/safety`

Corrected split (checked separately — they are not symmetric):

- **`@groundedos/safety`**: `GuardrailChain` is wired into exactly one place
  in the API — the standalone `/safety/*` playground
  (`apps/api/src/safety/safety.service.ts`) — not into `/rag/ask` or any
  agent endpoint. Phase 8's guardrail wiring in `/agents/*` is the first
  automatic `GuardrailChain` wiring into a live request path in this
  codebase; there is no existing pattern to copy.
- **`@groundedos/evals`**: **is** already wired into `/rag/ask` —
  `apps/api/src/rag-service.ts:52-109` instantiates
  `FaithfulnessEvaluator`/`RelevanceEvaluator`/`RecallEvaluator` and calls
  `.evaluate()` at `rag-service.ts:2024-2037` and `2705-2718`. Phase 8's
  eval wiring for `/agents/multi`/`/agents/plan` genuinely can follow this
  existing pattern (instantiate once, call `.evaluate()` on the final
  answer + evidence, same as `rag-service.ts` does for the final answer +
  retrieved chunks).

## Rollout plan

- No feature flag needed — guardrail/eval wiring is additive safety, not a
  behavior change users opt into. `MultiAgentRunnerConfig.enableSafetyChecks`
  already exists as an off-switch for local experimentation; default stays
  `true` to match current behavior once actually implemented.
- No new endpoint — extend the existing four.
- Suggested PR sequence: (1) docs-only sync PR fixing
  `packages/agents/README.md` + adding the ADR-015 index row — zero risk,
  can land immediately; (2) guardrail wiring + tests; (3) eval wiring +
  tests; (4) README Roadmap Phase 8 entry once (2)+(3) are merged, so the
  checklist reflects real state rather than intent.

## Decisions (resolved, not reopened)

1. **Phase numbering**: Phase 8, new. Phase 3's shipped checklist is not
   rewritten.
2. **LLM-backed reasoning**: out of scope for Phase 8. Separate future
   ADR/phase.
3. **`/agents/execute`'s guardrail path**: confirmed unguarded (see ADR-015
   Consequences) — added as a Success Criteria bullet and Design item 4
   above, handled in the same guardrail-wiring PR as the other three
   endpoints.
4. **Priority order within hardening**: guardrails before evals.
   `MultiAgentRunnerConfig.enableSafetyChecks` existing-but-unread is judged
   the more urgent gap (false sense of safety) than missing eval scores.
