# Schema Changelog

## 1.1

Date: 2026-05-09

Changes:

- Added enforced `schema_version` across instruction-layer YAML files.
- Added schema registry synchronization checks.
- Added migration policy support (`current_version`, `supported_versions`, transitions).
- Added minimum-content validation by schema type in `instructions:check`.

Migration:

- Apply with: `npm run instructions:migrate:apply -- --from 1.0 --to 1.1`
- Plan with: `npm run instructions:migrate:plan -- --from 1.1 --to 1.1`

## Planned 1.2

Planned focus:

- Optional strict typing for adapter definitions.
- Additional required metadata for skills (owner, stability, examples).
- Optional deprecation metadata per schema entry.
