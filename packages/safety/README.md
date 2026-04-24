# safety

Safety and guardrails layer. Protects the system from unsafe inputs and ensures reliable, grounded outputs.

## Responsibilities

- Detect and block prompt injection and jailbreak attempts
- Strip personally identifiable information (PII) from inputs and outputs
- Validate model outputs against grounding sources (hallucination detection)
- Enforce output schema and content policies
- Log safety events for auditing and review

## Status

Implemented (Phase 3 baseline)

## Current implementation

- `PromptInjectionGuardrail` detects instruction override attempts.
- `PIILeakageGuardrail` detects and sanitizes emails, phone numbers, CPF, SSN
  and credit-card-like values.
- `JailbreakGuardrail` detects role override and capability-claiming patterns.
- `HallucinationGuardrail` checks whether answer claims are grounded in provided
  retrieval chunks.
- `PromptLeakageGuardrail` detects requests for hidden/system instructions.
- `IndirectInjectionGuardrail` detects document-borne instruction injection.
- `GuardrailChain` runs multiple guardrails and can stop on the first blocking
  result.

## Current limits

- Guardrails are deterministic pattern/heuristic checks, not model-based safety
  classifiers.
- The suite is packaged and tested, but it is not yet wired across every API
  request path.
- Audit logging and policy storage are still future infrastructure work.
