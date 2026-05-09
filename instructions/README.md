# Agent Instruction Layer

This directory and its sibling top-level folders define the instruction system
used by Codex, Copilot Chat (VS Code), and GitHub Copilot.

## Goals

- Keep architecture, coding standards, roadmap context, and review expectations
  in one place.
- Reduce repeated human prompting for recurring tasks.
- Ensure instruction behavior is auditable and versioned.

## Resolution Order

When multiple instruction files apply, use this order:

1. `instructions/manifest.yaml` (global)
2. `configs/*.yaml` (runtime profile)
3. `context/*.yaml` (project facts)
4. `agents/*.yaml` (agent role behavior)
5. `skills/registry.yaml` and skill files
6. `prompts/*.md` templates
7. Explicit user request in the active conversation

If a higher-priority rule conflicts with a lower one, the higher rule wins.

## Language Strategy

- Canonical metadata: English
- Human guidance: bilingual (EN + PT-BR)
- User response language: match user language by default

## Scope Note

These folders are instruction metadata and process guides.
They are not runtime packages under `packages/`.
