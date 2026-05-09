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

## 1.2

Date: 2026-05-09

Changes:

- Added required skill metadata for `skills/registry.yaml` entries:
	- `owner` (string)
	- `stability` (string)
	- `examples` (non-empty array)
- Made `scripts/check-instruction-layer.ts` enforce these fields when
	`schema_version >= 1.2`.
- Added integration tests for instruction-layer checker and migration planner in
	`scripts/instruction-layer.test.ts`.

Migration:

- Apply with: `npm run instructions:migrate:apply -- --from 1.1 --to 1.2`
- Plan with: `npm run instructions:migrate:plan -- --from 1.2 --to 1.2`

## 1.3

Date: 2026-05-09

Changes:

- Added stricter adapter typing for `configs/adapters.yaml` entries:
	- `output_format` (must be `bundle-json+markdown`)
	- `merge_strategy` (must be `ordered-first-wins`)
	- `context_window_policy.max_files` (positive number)
	- `context_window_policy.include_user_request` (boolean)
- Extended schema registry validation to support optional deprecation metadata
	(`deprecated`, `deprecated_since`, `replacement_id`) when declared.

Migration:

- Apply with: `npm run instructions:migrate:apply -- --from 1.2 --to 1.3`
- Plan with: `npm run instructions:migrate:plan -- --from 1.3 --to 1.3`

## Planned 1.4

Planned focus:

- Optional deprecation workflow tooling (reports for deprecated schema entries).
- Additional lint checks for adapter policy consistency across consumers.
