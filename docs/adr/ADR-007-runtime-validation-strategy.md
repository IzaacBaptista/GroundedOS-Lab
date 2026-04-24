# ADR-007: Runtime Validation Strategy
## Status
Accepted

## Context
Compile-time TypeScript types do not protect runtime boundaries (API payloads, persisted artifacts, package outputs). GroundedOS requires runtime enforcement for stable contracts.

## Decision
Adopt a schema-first runtime validation layer in `packages/core` using Zod. Provide one validator per stable contract and throw `ContractViolationError` with contract name, field path and received value on failure.

Validation is required at package boundaries and response boundaries; internal private function handoffs may skip validation when already guarded by validated inputs.

## Consequences
- Faster failure on contract drift.
- Better debugging due to typed, structured errors.
- Slight runtime overhead, accepted for safety and observability benefits.

## Alternatives considered
- **TypeScript-only validation:** no runtime guarantees.
- **Custom hand-written validators:** more boilerplate and less consistency.
- **Other schema libraries:** possible later, but Zod is concise and ergonomic for current TypeScript stack.
