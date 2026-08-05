# Phase 8 Audit Findings — Multi-Agent Orchestration & Maintenance Triage

Date: 2026-08-05. Scope: GroundedOS-Lab repository, `main` branch.

> **Headline finding: the audit request's premise was wrong.** Multi-agent
> orchestration is not missing — it is implemented, tested, and merged to
> `main`. The real gap is documentation drift, not missing code. See §4.

---

## 1. Open PRs

`gh pr list --state open --limit 50` returned an **empty list** — there are
currently no open pull requests, Dependabot or otherwise. Etapa 4.4 (merge
order / auto-merge suggestion) is therefore moot until new PRs open; kept as
a standing recommendation for `.github/dependabot.yml` below in case that
changes before this doc is acted on.

## 2. Orphan issues (#77, #66, #65)

| Issue | Title | Related code found | Verdict |
|---|---|---|---|
| [#77](https://github.com/IzaacBaptista/GroundedOS-Lab/issues/77) | Reinforcement Learning | `grep -rl "ReinforcementEngine\|PolicyManager\|RewardEngine" packages/ experiments/ apps/` → **no matches** | Fully unimplemented. Body is a 25-item deliverable spec (RL foundation, bandits, policy optimization, safety constraints, API, UI) — much larger than a single issue; effectively an epic. |
| [#66](https://github.com/IzaacBaptista/GroundedOS-Lab/issues/66) | Synthetic Evaluation Generation | `grep -rl "SyntheticEvalGenerator"` → **no matches** | Fully unimplemented. Same epic-sized shape as #77 (question generation, multi-hop, adversarial datasets, coverage analysis, versioning, API, UI). |
| [#65](https://github.com/IzaacBaptista/GroundedOS-Lab/issues/65) | Deterministic Replay | `packages/core/src/contracts/replay-schemas.ts:1-40` defines `ExecutionSnapshotSchema` (version, correlation, document/index refs, retrieval config, providers). `apps/api/src/retrieval-reliability.ts:276` re-exports `ReplaySnapshot`/`ReplayComparisonReport` types. | **Partially implemented.** A snapshot/comparison data model exists, but there is no `DeterministicReplayEngine`, no drift/regression detection, no replay CLI commands (`npm run replay:*`), no replay suites. The issue body describes a much larger system than what's captured. |

All three issues share the same shape: they read as long-form architecture
briefs (20+ deliverables each: types, engines, API routes, UI panels, evals,
tests) rather than scoped, actionable issues. None have labels.

## 3. README "What Works Today" vs "Roadmap" divergences

Comparing [README.md:32-171](../../README.md#L32-L171) ("✅ What Works
Today") against [README.md:786-911](../../README.md#L786-L911) ("🧪
Roadmap"):

1. **Phase 7 is marked complete in "What Works Today" but absent from
   Roadmap.** [README.md:141](../../README.md#L141) has "### Phase 7 —
   Conceitos Lab UX ✅ Complete (Frontend Scope)" with a bullet list, but the
   Roadmap section jumps from Phase 6 ([README.md:891](../../README.md#L891))
   straight to "🧭 Execution Plan" — no "### Phase 7" heading, no checklist.
   Confirmed by `grep -n "^### Phase" README.md` — Phase 7 appears once, in
   "What Works Today" only.
2. **Multi-agent orchestration (ReAct, handoffs, planning) is implemented
   and tested but appears nowhere in either section.** See §4 for the full
   evidence. Phase 3's entry in both "What Works Today"
   ([README.md:63-69](../../README.md#L63-L69)) and Roadmap
   ([README.md:855-861](../../README.md#L855-L861)) only mentions
   `DocumentQAAgent`.
3. Everything else lines up: Phases 0, 1, 2, 2b, 4, 5, 6 have matching
   checklist entries in both sections with consistent status language.

## 4. Multi-agent orchestration: actual implementation state

This is the central finding. The task brief stated Phase 3 is "um único
`DocumentQAAgent` com tool calling — não há orquestração entre múltiplos
agentes ainda." That is **false as of `main`**. Evidence:

- **Git history**: `git log --oneline -- packages/agents/src/multi-agent-runner.ts`
  → commit `e9c1ff8` "feat(agents): implement ReAct loop, multi-agent
  handoff, and long-horizon planning" — on `main`, not a feature branch.
- **`packages/agents/src/multi-agent-runner.ts:42-438`** — `MultiAgentRunner`
  class runs a fixed pipeline `PlannerAgent → ResearcherAgent → CriticAgent →
  SynthesizerAgent` (line 60-343), building explicit `AgentHandoff` objects
  (line 113-131, 168-187, 238-263) with a `HandoffContext` carrying evidence,
  constraints and execution limits between agents. `createHandoffEnvelope()`
  (line 443-451) serializes handoffs for audit/replay.
- **`packages/agents/src/specialized-agents.ts:42-571`** — four concrete
  agent classes, each `extends BaseAgent`: `PlannerAgent` (line 42),
  `ResearcherAgent` (line 215), `CriticAgent` (line 342), `SynthesizerAgent`
  (line 466). Each registers its own tool (`generate-plan`,
  `research-retrieve`, `critique-evidence`, `synthesize-answer`).
- **`packages/agents/src/plan-executor.ts:29-386`** — `PlanCritic` (line 29)
  scores plan completeness/feasibility/efficiency and detects dependency
  cycles; `PlanExecutor` (line 145) runs a `TaskPlan` via topological sort
  (line 308-331) with cost limits, early termination, and replanning
  (line 351-368) on node failure.
- **`packages/agents/src/react-runner.ts:74-404`** — `ReActRunner.run()`
  implements the full Thought→Action→Tool→Observation loop with retry
  (line 302-359), repetitive-loop detection (line 178-184), and
  low-confidence early termination (line 145-147).
- **API wiring**: `apps/api/src/agents/agent.controller.ts:1-9` exposes
  **four** endpoints, not one:
  - `POST /agents/execute` — DocumentQA (the only one the brief knew about)
  - `POST /agents/react` — ReAct loop
  - `POST /agents/multi` — the Planner→Researcher→Critic→Synthesizer pipeline
  - `POST /agents/plan` — long-horizon plan-and-execute

  Backed by `apps/api/src/agents/agent.service.ts:1-362`, which imports
  `MultiAgentRunner`, `PlannerAgent`, `PlanExecutor`, `PlanCritic`,
  `ReActRunner` directly from `@groundedos/agents` (line 15-24). Request/
  response shapes are Zod-validated via `AgentMultiRequestSchema` /
  `AgentPlanRequestSchema` / `AgentReActRequestSchema` in
  `packages/core/src/contracts/api-schemas.ts:82-232`.
- **Test coverage**: `packages/agents/src/multi-agent.test.ts` (299 lines),
  `packages/agents/src/planning.test.ts` (375 lines),
  `packages/agents/src/react.test.ts` (360 lines) — not smoke-only stubs.

**What is genuinely still missing / stale**, confirmed by code, not by the
brief's assumption:

- `packages/agents/README.md` ("Current limits") still says *"The first
  agent path is document QA only"* and *"Reasoning is deterministic and
  heuristic-driven; it does not call an LLM yet."* The first claim is false
  (four paths exist). The second is **still true** — `PlannerAgent`,
  `ResearcherAgent`, `CriticAgent`, `SynthesizerAgent` all use keyword/
  heuristic logic (e.g. `decomposeObjective()` in
  `specialized-agents.ts:153-196` is a fixed 4-step template, not an LLM
  call), and this is the real technical gap behind the "orchestration"
  framing.
- **No guardrail integration**: `grep -n "safety\|Guardrail" packages/agents/src/multi-agent-runner.ts packages/agents/src/plan-executor.ts` → no matches.
  `MultiAgentRunnerConfig.enableSafetyChecks` (`multi-agent-types.ts:249`)
  is declared but never read anywhere in `multi-agent-runner.ts`. `grep -n
  "safety\|Guardrail\|Evaluator" apps/api/src/agents/agent.service.ts` → no
  matches either.

  **Correction (not verified at audit time, confirmed during
  implementation):** this section originally claimed "`@groundedos/
  safety`'s guardrail chain wraps `POST /rag/ask` (per README Phase 3
  claims) but not `/agents/multi`, `/agents/react`, or `/agents/plan`." That
  was an inference from the README, never checked against the actual
  endpoint code. It was wrong. `grep -rln "GuardrailChain" apps/api/src` →
  only `apps/api/src/lab/lab.service.ts` matches.
  `apps/api/src/rag-service.ts` — the file implementing `POST /rag/ask` —
  has **zero** references to `GuardrailChain` or `@groundedos/safety`. The
  only place `@groundedos/safety` is wired into a live API path is
  `apps/api/src/safety/safety.service.ts`, which backs the standalone
  `/safety/*` playground (`POST /safety/analyze`, `/critique`,
  `/constitutional`) that a caller invokes manually — it is not applied
  automatically to `/rag/ask` or any other request path. See also §7 below,
  since this is a gap in its own right, independent of Phase 8.
- **No evals integration**: no `@groundedos/evals` import in
  `agent.service.ts`. Multi-agent/plan/react runs are not scored by
  `FaithfulnessEvaluator`/`RelevanceEvaluator`/`RecallEvaluator`.
- **Roadmap/README silence**: none of this appears in README's "What Works
  Today" or "Roadmap" sections, so a reader following the documented project
  state would not know these four endpoints exist.

## 5. Next ADR number

`docs/adr/README.md` index ends at ADR-014. Next free number: **ADR-015**.

## 6. Reframed scope for Etapas 2–4

Given §4, the ADR and SDD below are **not** "should we build multi-agent
orchestration" (already decided and shipped) but:

- ADR-015 records, retroactively, the architecture that was already chosen
  and implemented (custom lightweight handoff protocol, consistent with
  ADR-008's "lightweight custom runner" precedent) — Status `Accepted`, not
  `Proposed`, because the code is merged and tested. It still documents the
  alternatives that were implicitly rejected (LangGraph, CrewAI-style role
  framework) so future contributors understand why the custom path was
  taken.
- The SDD scopes the *remaining* real work: closing the documentation gap,
  wiring guardrails/evals into the three new endpoints, and replacing
  heuristic reasoning with LLM-backed reasoning — not "designing"
  orchestration from scratch.

## 7. New finding: `/rag/ask` guardrail gap (out of scope for Phase 8)

Discovered during Phase 8 implementation (guardrail-wiring step), not
during this audit — the original audit text in §4 assumed `/rag/ask`
already had `GuardrailChain` wired in and that Phase 8's job was to extend
an existing pattern to the agent endpoints. That assumption was never
checked against `apps/api/src/rag-service.ts` at audit time. It's false.

- `grep -rln "GuardrailChain" apps/api/src` → only
  `apps/api/src/lab/lab.service.ts`. Nothing in `rag-service.ts`.
- `grep -rln "@groundedos/safety" apps/api/src` → only
  `apps/api/src/lab/lab.service.ts` and `apps/api/src/safety/safety.service.ts`.
- `apps/api/src/safety/safety.service.ts` backs a standalone `/safety/*`
  playground (`POST /safety/analyze`, `/critique`, `/constitutional`,
  `GET /safety/runs`, `/fixtures`) that a caller must invoke manually. It is
  not applied automatically to any request in the actual RAG or agent
  request paths.
- By contrast, `@groundedos/evals` **is** wired into `/rag/ask` —
  `apps/api/src/rag-service.ts:52-109` instantiates the three evaluators and
  calls `.evaluate()` at `rag-service.ts:2024-2037` and `2705-2718`. So the
  gap is specific to `@groundedos/safety`, not a general "nothing is wired
  into `/rag/ask`" problem.

**This is the project's most-used endpoint shipping with zero automatic
prompt-injection/PII/jailbreak/hallucination/prompt-leakage/indirect-
injection protection.** It deserves its own backlog item and likely its own
ADR (should guardrails wrap the whole `/rag/ask` pipeline the way they now
wrap agent handoffs, or does the semantic-cache/cost-tracking pipeline
already decided in ADR-009/ADR-013 change where the insertion point should
be?) — not a quick add bundled into Phase 8's agents-only scope. No
implementation proposed here.
