# Quickstart

1. Open `instructions/manifest.yaml` to understand global behavior.
2. Check `configs/default-profile.yaml` for default strictness.
3. Use `skills/registry.yaml` to route intent to a role and prompt template.
4. Load role behavior from `agents/*.yaml`.
5. Apply context facts from `context/*.yaml`.
6. Evaluate output quality with `evals/*.yaml` rubrics.

Generate consumer bundles:

```bash
npm run instructions:check
npm run instructions:resolve
npm run instructions:migrate:plan -- --from 1.1 --to 1.1
npm run instructions:migrate:apply -- --from 1.0 --to 1.1
```

For contribution policy and docs sync, use:

- `docs/documentation-governance.md`
- `.github/pull_request_template.md`
