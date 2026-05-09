# Documentation Governance

This document defines the minimum documentation updates required when work is
merged for any roadmap phase.

## Objective

Keep implementation status, roadmap checkboxes, and module-level READMEs aligned
in the same PR, so project state is auditable without guesswork.

## Mandatory Update Rule

For any feature/fix PR that affects roadmap progress, update all applicable
documentation in the same PR:

1. Root status summary in `README.md` (when phase scope or success criteria change)
2. The impacted module README (`apps/*`, `packages/*`, `experiments/*`, `infra/*`)
3. At least one phase/operational source document under `docs/`

If no documentation change is required, the PR must explicitly explain why.

## Required By Change Type

| Change type | Required documentation updates |
|---|---|
| API/runtime behavior change | `apps/api/README.md` and relevant `docs/*` contract/runbook file |
| Web UX/workflow change | `apps/web/README.md` and relevant docs usage guide |
| Package contract change | impacted `packages/<name>/README.md` and cross-reference in `README.md` if roadmap-facing |
| Experiment track update | `experiments/<name>/README.md` and artifact references in `datasets/README.md` when applicable |
| Infra/auth/queue update | `infra/README.md`, `docs/operational-runbook.md`, and `README.md` Phase 6 section |
| Concepts/study content update | `docs/concepts/*` or `docs/study-tracks/*` and index updates in `docs/README.md` |

## Roadmap Sync Policy

When a roadmap checkbox moves from planned to delivered:

1. Update the matching phase section in `README.md`
2. Ensure evidence exists (test, command, or artifact path)
3. Update the relevant module README status and limits
4. Add/adjust operational notes in `docs/` when runtime behavior changed

## README Status Vocabulary

Use only these status labels to reduce ambiguity:

- `Complete`: delivered baseline for the referenced phase/scope
- `In progress`: active rollout/hardening work
- `Backlog`: planned work not started
- `Placeholder`: reserved folder/package with explicit future extraction intent

## PR Reviewer Checklist (Docs)

- Does the PR change behavior, contracts, or roadmap status?
- If yes, are `README.md`, impacted module README, and relevant `docs/*` updated?
- Are command examples and endpoint references still valid?
- Are phase claims backed by test/artifact/operational evidence?
- Do status labels match the standard vocabulary?
