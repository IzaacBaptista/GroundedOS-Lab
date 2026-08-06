# Proposed README additions — not applied

Ready-to-paste text for `README.md`. Review and apply manually; nothing in
this file has been copied into `README.md` yet.

---

## 1. Missing "### Phase 7 — Conceitos Lab UX" block for the 🧪 Roadmap section

Insert after the existing "### Phase 6 — Infrastructure & Deploy" success
criteria block (currently ends around [README.md:910](../../README.md#L910)),
before "## 🧭 Execution Plan (Current)". Success criteria mirror what
"What Works Today" ([README.md:141-158](../../README.md#L141-L158)) and
`docs/PHASE-7-SUMMARY.md` already describe as delivered.

```markdown
### Phase 7 — Conceitos Lab UX

* Concept discovery (search, filters, persistence)
* Concept detail flow (modal, tabbed navigation)
* Dependency graph with multi-level expansion
* Portuguese-language didactic summaries
* Learning path tracking

**✅ Success Criteria:**
- [x] Sidebar supports full-text concept search with category/status filters, persisted locally — `apps/web/src/components/ConceptsSidebar.tsx`, `apps/web/src/hooks/useConceptsFilter.ts`
- [x] Concept detail flow is a single modal with Details/Dependencies/Paths tabs — `apps/web/src/components/ConceptModal.tsx`, `apps/web/src/components/ConceptDetailTabs.tsx`
- [x] Dependency graph supports multi-level expansion with directed edges, primary-path highlighting and a direct-relations focus mode — `apps/web/src/components/DependencyGraph.tsx`
- [x] Educational summary panel is structured in Portuguese (definition, when to use, common pitfalls, computational cost, popular libs, why it matters for RAG)
- [x] Learning Path panel tracks viewed/learned progress and recommends next concepts — `apps/web/src/components/LearningPathPanel.tsx`, `apps/web/src/hooks/useLearningProgress.ts`
- [x] Frontend build and test suite pass (32 tests passed, 4 skipped) — see [docs/PHASE-7-SUMMARY.md](../PHASE-7-SUMMARY.md)
```

---

## 2. New "### Phase 8 — Multi-Agent Orchestration Hardening" block

Insert after the Phase 7 block above. Unlike Phases 0–7, this phase starts
**partially checked** — the orchestration layer itself already exists; the
checklist tracks the hardening work in
[SDD-phase8-multi-agent-orchestration.md](./SDD-phase8-multi-agent-orchestration.md).

```markdown
### Phase 8 — Multi-Agent Orchestration Hardening

* Guardrails and evals applied to every agent handoff, not just `/rag/ask`
* Documentation sync between `packages/agents` and the shipped API surface
* Architecture decision recorded in ADR-015

**✅ Success Criteria:**
- [x] `MultiAgentRunner` implements an explicit Planner→Researcher→Critic→Synthesizer handoff protocol with `AgentHandoff`/`HandoffEnvelope` — `packages/agents/src/multi-agent-runner.ts`
- [x] `ReActRunner` and `PlanExecutor` provide single-agent ReAct loops and long-horizon plan-and-execute with replanning — `packages/agents/src/react-runner.ts`, `packages/agents/src/plan-executor.ts`
- [x] API exposes `POST /agents/react`, `POST /agents/multi`, `POST /agents/plan` alongside `POST /agents/execute` — `apps/api/src/agents/agent.controller.ts`
- [x] Architecture decision recorded in [ADR-015](../adr/ADR-015-multi-agent-orchestration-strategy.md)
- [ ] `@groundedos/safety` guardrails run on every agent handoff, not only on `/rag/ask`
- [ ] `@groundedos/evals` scores are attached to multi-agent/plan traces
- [ ] `packages/agents/README.md` and this README describe all four agent endpoints and four specialized roles accurately
```

---

## 3. Orphan issue recommendations (not applied — for review)

| Issue | Recommendation | Why |
|---|---|---|
| [#77 Reinforcement Learning](https://github.com/IzaacBaptista/GroundedOS-Lab/issues/77) | **Move to a "stretch goals" backlog**, do not link as a Phase 8 sub-task | The issue body is a 25-point epic (RL foundation, bandits, policy optimization, safety constraints, dashboards, API, tests) with zero existing code. It's unrelated to Phase 8's orchestration-hardening scope — bundling it would blow up Phase 8's size for no shared code. If kept as a phase, it should be its own numbered phase with its own ADR later. |
| [#66 Synthetic Evaluation Generation](https://github.com/IzaacBaptista/GroundedOS-Lab/issues/66) | **Move to stretch goals**, same reasoning as #77 | Same epic shape, zero existing code (`SyntheticEvalGenerator` etc. don't exist anywhere). It's an `@groundedos/evals` extension, not an agents/orchestration concern — doesn't belong under Phase 8. |
| [#65 Deterministic Replay](https://github.com/IzaacBaptista/GroundedOS-Lab/issues/65) | **Keep open, re-scope, don't close** | Unlike #77/#66, this one has real partial groundwork: `ExecutionSnapshotSchema` in `packages/core/src/contracts/replay-schemas.ts` and `ReplaySnapshot`/`ReplayComparisonReport` types re-exported from `apps/api/src/retrieval-reliability.ts:276`. Recommend narrowing the issue to "build `DeterministicReplayEngine` on top of the existing `ExecutionSnapshot` model" rather than the full 27-deliverable scope in the current body — most of Phases D–N in the issue (drift detection, CI reporters, replay suites) are follow-on work once the engine exists. |

None of these issues were modified, labeled, or closed — this is a
recommendation for you to apply via `gh issue edit` / `gh issue close` if
you agree.

---

## 4. Dependabot PRs — merge order and auto-merge config

`gh pr list --state open --limit 50` returned **zero open PRs** at audit
time (2026-08-05). There is nothing to sequence right now. Kept here as a
standing recommendation for when Dependabot PRs do open, since
`.github/dependabot.yml` was checked and does not currently exist in this
repo (`find . -name dependabot.yml` → no match) — so there's no existing
auto-merge policy to conflict with.

Suggested `.github/dependabot.yml` addition (not created — you'd need to
also create the base Dependabot config, which doesn't exist yet either):

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

Suggested merge-order policy once PRs exist: patch bumps first, then minor,
then major, with any PR that Dependabot/GitHub flags with a security
advisory jumped to the front of the queue regardless of bump size. Auto-merge
(via a separate GitHub Actions workflow gated on CI passing) is reasonable
for patch/minor; major bumps should stay manual-review given this repo pins
exact framework versions (NestJS, React 19) that Phase 1/6 ADRs discuss.

---

## 5. `docs/adr/README.md` index row for ADR-015

Append to the Index table at the bottom of `docs/adr/README.md`:

```markdown
| [ADR-015](./ADR-015-multi-agent-orchestration-strategy.md) | Multi-agent orchestration strategy | Accepted |
```
