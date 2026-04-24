# Workflow Orchestration
> Explicit step-based execution for pipelines, with state transitions and per-step observability.

## Why it matters
Implicit function chains are hard to inspect and debug. A workflow model makes every pipeline stage visible (`pending`, `running`, `success`, `failed`, `skipped`) and gives deterministic execution traces in Dev Mode.

## How it works in GroundedOS Lab
- `packages/core/src/workflow/types.ts` defines workflow contracts.
- `packages/core/src/workflow/runner.ts` executes named steps in order, measures duration and stops on first failure.
- `apps/api/src/rag-service.ts` now runs ask flows as explicit steps:
  - `normalize-request`
  - `ingest-document`
  - `build-index`
  - `process-query`
  - `retrieve-chunks`
  - `build-answer`
- API responses include `devMode.workflowContext` with per-step status and duration.

## Where it lives in the code
- `packages/core/src/workflow/types.ts`
- `packages/core/src/workflow/runner.ts`
- `packages/core/src/workflow/workflow.test.ts`
- `apps/api/src/rag-service.ts`

## Observable experiment
1. Call `POST /rag/ask`.
2. Inspect `devMode.workflowContext.steps`.
3. Confirm each stage status and duration are present.
4. Introduce a forced failure in one step locally and observe remaining steps marked `skipped`.

## Related concepts
- [Planning](./planning.md)
- [Observability](./observability.md)
- [Tool Calling](./tool-calling.md)

## Further reading
- [ADR-008 Workflow Engine Design](../adr/ADR-008-workflow-engine-design.md)
