# Agent Instruction Layer

This document explains how the instruction layer is organized and how to use it
across Codex, Copilot Chat (VS Code), and GitHub Copilot.

## Objective

Provide a reusable instruction foundation so contributors do not need to repeat
architecture, standards, roadmap context, and PR expectations in every prompt.

## Folder Map

- `instructions/`: global manifest and entrypoint index
- `configs/`: execution profiles and tool adapters
- `context/`: project and contribution facts
- `agents/`: planner/implementer/reviewer role behavior
- `skills/`: skill routing and mapping
- `prompts/`: bilingual templates for common intents
- `evals/`: adherence scoring rubrics

## Source Of Truth

- Global policy starts at `instructions/manifest.yaml`.
- Folder entrypoints are listed in `instructions/index.yaml`.
- Schema registry lives in `instructions/schema/schema-registry.yaml`.
- Documentation sync policy is in `docs/documentation-governance.md`.

## Validation

Run locally:

```bash
npm run instructions:validate
npm run instructions:check
npm run instructions:migrate:plan -- --from 1.1 --to 1.1
npm run instructions:migrate:apply -- --from 1.0 --to 1.1
```

The validator checks required files for the instruction layer MVP.
The check command validates schema/references and generates consumer bundles.

## Resolution and Consumer Bundles

Generate per-consumer instruction bundles:

```bash
npm run instructions:resolve
```

Generated outputs:

- `instructions/generated/resolution-report.json`
- `instructions/generated/codex.bundle.json`
- `instructions/generated/codex.bundle.md`
- `instructions/generated/copilot_chat_vscode.bundle.json`
- `instructions/generated/copilot_chat_vscode.bundle.md`
- `instructions/generated/github_copilot.bundle.json`
- `instructions/generated/github_copilot.bundle.md`

## Rollout Mode

Current rollout mode is moderate:

- CI check runs in warning style (non-blocking)
- Teams can harden to blocking mode after stable adoption

## Schema Versioning

- All instruction-layer YAML files declare `schema_version`.
- `npm run instructions:check` validates schema-version compliance using the
  registry in `instructions/schema/schema-registry.yaml`.
- Transition policy is defined in `instructions/schema/migration-policy.yaml`.

## Ownership

- Review ownership for instruction-layer assets is defined in `.github/CODEOWNERS`.
