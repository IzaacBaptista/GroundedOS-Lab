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
- Documentation sync policy is in `docs/documentation-governance.md`.

## Validation

Run locally:

```bash
npm run instructions:validate
```

The validator checks required files for the instruction layer MVP.

## Rollout Mode

Current rollout mode is moderate:

- CI check runs in warning style (non-blocking)
- Teams can harden to blocking mode after stable adoption
