# CI Governance Hardening

## Overview

The instruction-layer validation in CI has been transitioned from **warning-mode** to **strict-mode**. This means:

- ❌ PRs that violate instruction-layer schema or governance rules **will fail CI**.
- ❌ Builds cannot merge if instruction-layer checks do not pass.
- ✅ Ensures all instruction-layer files maintain schema consistency, versioning, and ownership.

## What Changed

### Before (Warning Mode)
```yaml
- name: Validate instruction layer (warning mode)
  run: npm run instructions:validate || echo "Instruction layer check reported warnings"

- name: Check instruction layer schema and resolution (warning mode)
  run: npm run instructions:check || echo "Instruction layer schema/resolution check reported warnings"
```

### After (Strict Mode)
```yaml
- name: Validate instruction layer (strict mode)
  run: npm run instructions:validate

- name: Check instruction layer schema and resolution (strict mode)
  run: npm run instructions:check
```

## Why This Matters

1. **Governance Enforcement**: Schema versions, owner assignments, and adapter configurations are now mandatory.
2. **Prevention of Silent Drift**: Changes to instruction-layer files must pass full validation pipeline before merge.
3. **Consistency Guarantee**: All consumers (Codex, Copilot Chat VS Code, GitHub Copilot) receive consistent instruction bundles.

## What Happens If CI Fails

If your PR fails the instruction-layer checks:

```bash
# Run locally to diagnose
npm run instructions:validate     # Check required paths
npm run instructions:check         # Check schema, versioning, content
npm run instructions:deprecations  # Report any deprecated entries
```

## Common Issues & Fixes

### Issue: `schema_version` mismatch
**Error**: "schema version mismatch for X.yaml: expected 1.3, got 1.2"

**Fix**: Update the file's `schema_version: "1.3"` field.

### Issue: Missing required metadata for skills
**Error**: "skill.owner must be string for schema >= 1.2"

**Fix**: Ensure skill entries include:
- `owner` (string, required for >= 1.2)
- `stability` (string, required for >= 1.2)
- `examples` (non-empty array, required for >= 1.2)

### Issue: Adapter validation failure
**Error**: "adapter 'codex' output_format must be 'bundle-json+markdown'"

**Fix**: For schema >= 1.3, ensure adapters include:
- `output_format: bundle-json+markdown`
- `merge_strategy: ordered-first-wins`
- `context_window_policy` with `max_files` and `include_user_request`

## Migration Path

If you have deprecated entries in the schema registry:

```bash
npm run instructions:deprecations
```

This generates a migration checklist. Update references and remove deprecation metadata once complete.

## CI Integration

The CI job (`lint`) now:
1. Validates required paths
2. Checks schema compliance and versioning
3. Validates semantic content by schema type
4. Resolves consumer bundles
5. Reports deprecation warnings (non-blocking)

All checks must pass for successful merge to `main`.

## Rollback Plan

If strict-mode causes adoption issues, the check can be temporarily relaxed:

```yaml
run: npm run instructions:check || exit 0  # Warning mode
```

However, this is not recommended after the initial announcement period.

## References

- Schema registry: `instructions/schema/schema-registry.yaml`
- Migration policy: `instructions/schema/migration-policy.yaml`
- Changelog: `instructions/schema/CHANGELOG.md`
- Validation docs: `docs/agent-instruction-layer.md`
