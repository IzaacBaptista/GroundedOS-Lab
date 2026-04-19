# Guardrails

## What it is

**Guardrails** are rules, checks and controls that constrain AI system behavior before, during or after model generation.

## Why it matters

Grounded systems need protection against prompt injection, jailbreaks, PII leakage, unsupported claims and invalid outputs. Guardrails make the system safer and more reliable when models are uncertain or manipulated.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/safety`](../../packages/safety/README.md) | Owns prompt injection detection, PII stripping, grounding enforcement and output validation. |
| [`experiments/jailbreak-defense`](../../experiments/jailbreak-defense/README.md) | Tests attack vectors against defense mechanisms. |
| [`experiments/bias-tests`](../../experiments/bias-tests/README.md) | Measures bias signals and mitigation strategies. |
| [`packages/agents`](../../packages/agents/README.md) | Applies guardrails to tool use and autonomous flows. |
| [`packages/observability`](../../packages/observability/README.md) | Logs safety events for review and auditing. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Safety vs false positives** | Strict guardrails can block legitimate user requests. |
| **Coverage** | Static rules may miss novel attacks or contextual risks. |
| **User experience** | Refusals and corrections need to be clear and actionable. |
