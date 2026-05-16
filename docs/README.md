# docs

This folder contains documentation for the GroundedOS Lab project. It covers AI concept explanations, guided study tracks, architecture decision records, and per-phase output contracts.

## Responsibilities

- Explain core AI concepts used throughout the project
- Map concepts into guided learning routes across packages, experiments and roadmap phases
- Record architecture and technology decisions with their rationale (ADRs)
- Define per-phase output contracts so contributors know what "done" looks like
- Serve as the single source of truth for project knowledge

## Contents

| Folder / File | What it contains |
|---|---|
| [`concepts/`](./concepts/README.md) | One file per AI concept, linked to code. Includes the concept file template. |
| [`study-tracks/`](./study-tracks/README.md) | Guided learning routes by topic across concepts, packages and roadmap phases. |
| [`adr/`](./adr/README.md) | Architecture Decision Records — why the system is built the way it is. |
| [`evaluation-strategy.md`](./evaluation-strategy.md) | How quality is measured: golden dataset, metrics, baselines, eval process. |
| [`agent-instruction-layer.md`](./agent-instruction-layer.md) | Instruction layer structure and usage for Codex/Copilot/GitHub Copilot. |
| [`documentation-governance.md`](./documentation-governance.md) | Required doc updates per roadmap phase and PR review checklist for docs sync. |
| [`operational-runbook.md`](./operational-runbook.md) | Runtime operations for auth, jobs queue, worker startup, and troubleshooting. |
| [`phase-0-mvp-plan.md`](./phase-0-mvp-plan.md) | Phase 0 implementation plan and milestone definitions. |
| [`phase-1-handoff.md`](./phase-1-handoff.md) | Phase 1 baseline, verified commands and open implementation issues. |
| [`phase-1-dev-mode-output.md`](./phase-1-dev-mode-output.md) | Stable Dev Mode output contract (retrieval baseline + adaptive extensions: cache/routing/orchestration/evals/cost). |
| [`phase-1-local-rag.md`](./phase-1-local-rag.md) | Local RAG usage guide (commands, limits, providers). |
| [`phase-1-rag-internals.md`](./phase-1-rag-internals.md) | End-to-end Phase 1 RAG internals guide mapping concepts to code. |
| [`PHASE-7-CONCEITOS-UX.md`](./PHASE-7-CONCEITOS-UX.md) | Consolidated implementation status for the Conceitos Lab UX frontend scope. |
| [`PHASE-7-SUMMARY.md`](./PHASE-7-SUMMARY.md) | Final delivery summary for Phase 7 with validation results and follow-ups. |
| [`ollama-setup.md`](./ollama-setup.md) | Ollama installation and GroundedOS integration guide. |

## Status

In progress (Phase 6-7 documentation rollout): aligned with runnable
implementation through Phase 5, with Phase 6 in active rollout
(auth/admin/rate-limit/audit baseline, optional DB-backed auth persistence,
and Redis-backed async jobs), and Phase 7 frontend UX delivery documented for
the Conceitos Lab surface.
