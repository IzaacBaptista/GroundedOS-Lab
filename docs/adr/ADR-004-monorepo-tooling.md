# ADR-004 — Monorepo tooling: npm workspaces + Vitest

**Status:** Accepted

## Context

GroundedOS Lab is a monorepo containing TypeScript packages, Next.js apps and Python experiments. Tooling decisions made here affect every contributor's onboarding experience and every CI run.

## Options considered

### Package manager / workspace

| Option | Pros | Cons |
|---|---|---|
| **npm workspaces** | Built-in to npm ≥ 7, no extra tooling, familiar to any Node developer | No incremental build caching without Turborepo |
| **pnpm workspaces** | Fast installs, strict dependency isolation, smaller `node_modules` | Less familiar, stricter hoisting rules can surprise contributors |
| **Yarn workspaces** | Mature, good plugin ecosystem | Multiple major versions with incompatible configs, extra setup |

### Test runner (TypeScript)

| Option | Pros | Cons |
|---|---|---|
| **Vitest** | Native ESM support, fast (Vite-based), compatible with the existing `"type": "module"` setup, Jest-compatible API | Smaller ecosystem than Jest, fewer plugins |
| **Jest** | Largest ecosystem, most examples in the wild | Requires extra config for ESM packages, slower for this workspace layout |

## Decision

**npm workspaces + Vitest.**

npm workspaces were chosen because they require zero additional tooling to get a multi-package workspace running. This keeps the initial contributor setup to `npm install` and nothing else.

Vitest was chosen because all packages use `"type": "module"` (ESM). Jest's ESM support requires additional Babel or ts-jest configuration that would add setup overhead and fragility. Vitest works out of the box with the existing TypeScript + ESM configuration.

**Turborepo** is listed as a planned addition for incremental build caching once the number of packages makes uncached full-repo builds noticeably slow.

## Consequences

- All packages in `packages/` must declare their dependencies explicitly in their own `package.json` — no implicit shared dependencies via hoisting.
- Tests are run with `vitest` and configured from the root `vitest.config.ts`.
- Python packages use `Poetry` per-package (independent of npm workspaces) — they are not part of the npm workspace graph.
- When Turborepo is added, the `turbo.json` pipeline must be verified against the existing npm scripts before enabling caching.
