# jailbreak-defense

Experiments studying jailbreak attack patterns and evaluating defense mechanisms in the safety layer.

## Responsibilities

- Catalog known jailbreak techniques and prompt injection patterns
- Test attack vectors against the safety package guardrails
- Measure detection rates, false positives and false negatives
- Propose and validate improvements to defense strategies

## Status

Backlog (not implemented yet). Directory exists as a Phase 6+ placeholder for
future red-team fixtures and guardrail stress-test runs.

## Current scope

- No standalone red-team runner is committed in this directory yet.
- Guardrail logic exists in `packages/safety`; this folder is reserved for
  adversarial fixture sets and repeatable attack campaigns.
- Experiment outputs are planned to be stored as versioned artifacts under
  `datasets/experiments/`.

## Entry criteria for implementation

1. Define attack taxonomy (prompt injection, jailbreak chaining, indirect injection).
2. Define pass/fail gates (detection rate, false positive budget, bypass severity).
3. Define secure handling policy for sensitive attack payloads and outputs.

## Next milestones

1. Add initial adversarial prompt fixture corpus with metadata.
2. Add reproducible runner and report schema for guardrail stress tests.
3. Wire summary results into Phase 6 observability/evals reporting.
