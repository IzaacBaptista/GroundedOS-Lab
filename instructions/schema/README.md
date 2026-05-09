# Instruction Schemas

This folder defines versioned schema metadata for instruction-layer YAML files.

## Current policy

- Every instruction-layer YAML file must declare `schema_version`.
- `scripts/check-instruction-layer.ts` validates that each file matches the
  expected version declared in `schema-registry.yaml`.
- Schema rollout starts with exact matching to prevent silent drift.

## Change management

When changing the structure of a YAML file:

1. Update the file's `schema_version`.
2. Update `schema-registry.yaml`.
3. Update check logic if new required fields are introduced.
4. Update docs (`docs/agent-instruction-layer.md`) with migration notes.
