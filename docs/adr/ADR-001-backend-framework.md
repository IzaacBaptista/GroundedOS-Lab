# ADR-001 — Backend framework: Fastify

**Status:** Accepted

## Context

The GroundedOS Lab API server needs a Node.js HTTP framework. Two credible choices were evaluated: **Fastify** and **NestJS**. Both are production-grade, well-maintained and have TypeScript support.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **Fastify** | Minimal core, explicit plugin model, fastest Node HTTP framework by throughput, easy to test without framework magic | Less structural scaffolding — team must decide conventions themselves |
| **NestJS** | Full-stack opinions (DI, modules, decorators), familiar to Angular developers, lots of enterprise integrations | Heavy framework overhead, opinionated abstractions add complexity for an experimental platform, harder to understand internal mechanics |

## Decision

**Fastify** was chosen.

GroundedOS Lab is primarily a learning and experimentation platform. The goal is to make AI pipeline mechanics visible, not to hide them behind framework abstractions. Fastify's explicit, low-overhead model aligns with this goal: every plugin, route and hook is visible and understandable. NestJS would trade that transparency for scaffolding that adds complexity without educational value for this project.

The existing `apps/api` implementation already uses Fastify (`fastify` + `@fastify/multipart`), which makes this the confirmed, not aspirational, choice.

## Consequences

- The API server uses Fastify plugins for all cross-cutting concerns (multipart, CORS, auth in Phase 6).
- There is no dependency injection container — services are composed explicitly in route handlers or factory functions.
- Future contributors should not introduce NestJS patterns or decorators.
- If the project grows to a size where NestJS modularity becomes valuable, a new ADR should be written before migrating.
