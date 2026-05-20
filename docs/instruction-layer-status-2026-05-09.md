# Instruction Layer Implementation Status

**Date**: May 9, 2026  
**Status**: Production-Ready with Strict-Mode CI  
**Schema Version**: 1.3

## Executive Summary

The agent instruction layer has been fully implemented with enterprise-grade governance, schema versioning, automated validation, and strict CI enforcement. All 12 foundational instruction-layer YAML files are now version-controlled, validated, and enforced to version 1.3.

## Architecture

```
instructions/
├── manifest.yaml           (1.3) global policy & consumers
├── index.yaml              (1.3) entrypoint mapping
├── schema/
│   ├── schema-registry.yaml       (1.0) versioned file registry
│   ├── migration-policy.yaml      (1.0) current_version=1.3, transitions
│   ├── CHANGELOG.md               documentation of schema evolution
│   └── README.md                  schema management guidance
configs/
├── default-profile.yaml    (1.3) execution profile
└── adapters.yaml           (1.3) consumer source-of-truth mappings
context/
├── project-context.yaml    (1.3) project facts & roadmap
└── contribution-context.yaml (1.3) contribution constraints
agents/
├── planner.yaml            (1.3) planner role behavior
├── implementer.yaml        (1.3) implementer role behavior
└── reviewer.yaml           (1.3) reviewer role behavior
skills/
└── registry.yaml           (1.3) skill intent routing (owner, stability, examples required)
prompts/
├── feature-request.md      bilingual templates
├── bugfix-request.md       for common intents
├── review-request.md
└── docs-request.md
evals/
├── adherence-rubric.yaml   (1.3) scoring policy alignment
└── review-rubric.yaml      (1.3) scoring code quality
```

## Schema Versioning

| Version | Release Date | Key Features | Migration |
|---------|-------------|--------------|-----------|
| 1.0 | 2026-05-09 | Foundation, basic versioning | (baseline) |
| 1.1 | 2026-05-09 | Enforced schema_version, registry sync | 1.0→1.1 (apply) |
| 1.2 | 2026-05-09 | Skill metadata (owner, stability, examples) | 1.1→1.2 (apply) |
| 1.3 | 2026-05-09 | Adapter typing, deprecation support | 1.2→1.3 (apply) |

## Validation Pipeline

### Local Validation
```bash
npm run instructions:validate     # Ensure required paths exist
npm run instructions:check         # Full schema + content validation
npm run instructions:deprecations  # Report deprecated entries
npm run instructions:resolve       # Generate consumer bundles
npm run instructions:migrate:plan  # Plan migration (read-only)
npm run instructions:migrate:apply -- --from X --to Y  # Execute migration
```

### CI Validation (Strict-Mode)
- **Branch**: main, develop
- **Trigger**: push, pull_request
- **Job**: lint
- **Steps**:
  1. `instructions:validate` (blocking)
  2. `instructions:check` (blocking)
  3. `instructions:deprecations` (informational)
- **Outcome**: Failing checks block PR merge

## Consumer Bundles

Resolved to `instructions/generated/`:

| Consumer | Files | Patterns | Use Case |
|----------|-------|----------|----------|
| `codex` | 14 | manifest, agents, skills, context, prompts, evals | Internal model coordination |
| `copilot_chat_vscode` | 14 | (same patterns) | VS Code Copilot Chat integration |
| `github_copilot` | 14 | (same patterns) | GitHub Copilot integration |

## Governance Features

### 1. Schema Registry
- Central mapping of instruction-layer YAML files to schema versions
- Tracks deprecation metadata (`deprecated`, `deprecated_since`, `replacement_id`)
- File-level versioning independent from code versioning

### 2. Migration Policy
- Explicit transitions between versions (1.0→1.1, 1.1→1.2, 1.2→1.3)
- Self-transitions (noop) to simplify idempotent operations
- Automatic addition of new self-transition on version bump

### 3. Ownership (CODEOWNERS)
Directories assigned to instruction-layer maintainers:
- `/instructions/`
- `/agents/`
- `/skills/`
- `/context/`
- `/prompts/`
- `/evals/`
- `/configs/`
- `/scripts/check-instruction-layer.ts`
- `/scripts/resolve-instruction-layer.ts`

### 4. Deprecation Tooling
Script `scripts/report-instruction-deprecations.ts`:
- Scans schema registry for `deprecated: true` entries
- Generates human-readable migration report
- Produces automated migration checklist

### 5. Automated Tests
File `scripts/instruction-layer.test.ts` (5 tests):
- ✅ Checker passes on current workspace state
- ✅ Migration planner defaults to policy current_version
- ✅ Deprecation report runs without crashing
- ✅ Resolver generates bundles for all consumers
- ✅ Reference validator passes with valid graph

## Schema 1.3 Capabilities

### Manifest (1.3)
- Required: version, name, owner, status, strictness
- Required: consumers array (non-empty)
- Required: resolution_order array (includes "user-request")
- Required: governance object (docs_policy, pr_template)

### Skills Registry (1.3)
- Required for each skill: id, owner, stability, examples
- Required: agent, prompt_template, eval_profile
- Examples must be non-empty array
- Owner and stability are arbitrary strings but enforce presence

### Adapters (1.3)
- Required per adapter: source_of_truth (non-empty array of strings)
- New in 1.3: output_format (must be "bundle-json+markdown")
- New in 1.3: merge_strategy (must be "ordered-first-wins")
- New in 1.3: context_window_policy with max_files (positive) and include_user_request (boolean)

### Schema Registry Entries (1.3)
- Optional: deprecated (boolean)
- If deprecated is true, required: deprecated_since, replacement_id
- Enables gradual migration of instruction-layer components

## CI Strict-Mode Impact

### Before (Warning-Mode)
```
Instructions:validate ─→ ⚠️ Warning (non-blocking)
Instructions:check ────→ ⚠️ Warning (non-blocking)
```

### After (Strict-Mode)
```
Instructions:validate ─→ ❌ FAIL PR if violated
Instructions:check ────→ ❌ FAIL PR if violated
```

## Migration Guidance for Contributors

### When You Modify Instruction-Layer Files

1. **File Updated**: Update `schema_version` field to match current version (1.3)
2. **Field Added**: Add to `instructions/schema/schema-registry.yaml` if new file
3. **New Version Planned**: File CHANGELOG.md and update migration-policy.yaml
4. **Run Locally**: `npm run instructions:check` before pushing
5. **CI Will Enforce**: Failing checks block PR merge

### Common Scenarios

**Scenario 1: Update skill metadata**
```yaml
# In skills/registry.yaml
- id: my-skill
  owner: my-team            # Required in 1.3
  stability: beta           # Required in 1.3
  examples: []              # Required in 1.3, must not be empty
```

**Scenario 2: Add adapter configuration**
```yaml
# In configs/adapters.yaml
my_adapter:
  source_of_truth:
    - instructions/manifest.yaml
  output_format: bundle-json+markdown        # Required in 1.3
  merge_strategy: ordered-first-wins         # Required in 1.3
  context_window_policy:                     # Required in 1.3
    max_files: 24
    include_user_request: true
```

**Scenario 3: Deprecate a schema entry**
```yaml
# In instructions/schema/schema-registry.yaml
- id: old-entry
  file: agents/old-agent.yaml
  schema_version: "1.3"
  deprecated: true
  deprecated_since: "1.4"
  replacement_id: new-entry
```

Then run: `npm run instructions:deprecations` to generate migration steps.

## Next Opportunities

1. **Schema 1.4**: Stricter lint rules for reference consistency across consumers
2. **Linter Extension**: Detect references to deprecated schema entries in code
3. **Observability**: Dashboard showing schema health across components
4. **Integration**: Embed bundles as environment data in runtime containers
5. **Analytics**: Track instruction-layer version adoption per consumer

## Rollback Plan

If strict-mode causes critical issues:

```yaml
# In .github/workflows/ci.yml
- name: Check instruction layer schema and resolution
  run: npm run instructions:check || exit 0
```

However, this is not recommended after initial announcement period.

## References

- Schema docs: `docs/agent-instruction-layer.md`
- CI strict-mode guide: `docs/ci-instruction-layer-strict-mode.md`
- Schema registry: `instructions/schema/schema-registry.yaml`
- Migration policy: `instructions/schema/migration-policy.yaml`
- Changelog: `instructions/schema/CHANGELOG.md`
- CODEOWNERS: `.github/CODEOWNERS`
