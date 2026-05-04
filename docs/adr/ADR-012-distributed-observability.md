# ADR-012 — Distributed Observability: OpenTelemetry, Trace Propagation, and Dashboards

**Status:** Accepted

## Context

GroundedOS Lab now spans multiple runtime boundaries: a Node.js / Fastify API, a Python async worker that consumes BullMQ jobs from Redis, and a PostgreSQL backend. As the system grows toward multi-user deployment, debugging failures and performance regressions across these boundaries becomes impractical without correlated telemetry.

Key pain points:
- A job can be enqueued in the API and fail silently in the Python worker with no trace back to the originating HTTP request.
- Retrieval latency spikes cannot be attributed to embedding generation, vector search, or re-ranking without per-operation spans.
- There is no way to alert on SLO breaches (queue depth, error rate, p99 latency) without an external metrics target.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **OpenTelemetry SDK (OTel) with OTLP export** | Vendor-neutral; single SDK for traces, metrics, and logs; official SDKs for Node.js and Python; W3C `traceparent` propagation works across HTTP and queue boundaries | Adds SDK dependency to API and worker; requires a collector or compatible backend |
| **Vendor-specific APM (Datadog, New Relic)** | Rich out-of-the-box dashboards, auto-instrumentation | Vendor lock-in; paid beyond free tier; credential management for every environment |
| **Prometheus + manual logging** | Widely understood; no SDK required | No distributed tracing; correlating logs across API and worker requires manual correlation IDs; no span-level granularity |
| **Structured logging only** | Zero overhead; no new dependency | Not traceable across async hops; aggregation requires log ingestion pipeline |

## Decision

**Adopt OpenTelemetry as the single observability standard for all runtimes.**

### Rationale

1. OTel is the CNCF standard for distributed telemetry. Switching exporters (Jaeger → Tempo → Honeycomb) is a config change, not a code change.
2. W3C `traceparent` headers propagate through HTTP *and* can be carried as BullMQ job metadata, enabling end-to-end trace correlation from API enqueue to worker completion.
3. Both `@opentelemetry/sdk-node` (Node.js) and `opentelemetry-sdk-trace-base` (Python) support auto-instrumentation for Fastify, `pg`, `redis`, `httpx`, and `psycopg`.
4. Prometheus-compatible metrics can be scraped via the OTel Prometheus exporter without adding a separate Prometheus client.

### Scope

**Phase 6 Observability Contract**

| Signal | Source | Exporter | Minimum instrumentation |
|---|---|---|---|
| Traces | API + Worker | OTLP/gRPC or OTLP/HTTP | HTTP request span, job enqueue span, job processor span |
| Metrics | API + Worker | OTLP or Prometheus scrape | Request counter, error counter, job duration histogram, queue depth gauge |
| Logs | API + Worker | Structured JSON to stdout; correlated by `trace_id` | All existing log statements enriched with `trace_id` and `span_id` |

### Trace propagation across the queue boundary

Because BullMQ jobs are not HTTP requests, `traceparent` cannot be injected automatically. The API must serialize the active span context into the BullMQ job payload under a reserved key `_otel_context`, and the Python worker must deserialise and restore the context before processing.

```
API HTTP request  ──►  API enqueue span  ──►  job payload { ..., _otel_context: "00-<traceId>-<spanId>-01" }
                                                  │
                                           Redis queue
                                                  │
                                         Python worker dequeue  ──►  restore context  ──►  processor span (child of API span)
```

### Collector deployment

- **Development**: A lightweight `otelcol-contrib` sidecar in `docker-compose.yml` routes traces to Jaeger and metrics to Prometheus. Both are exposed on local ports for easy dashboard access.
- **Production / CI**: Environment variables `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME` control the export target; if the endpoint is unset the SDK runs in no-op mode to avoid breaking environments without a collector.

### Feature flag

Export is controlled by `OTEL_EXPORT_ENABLED` (default `false`). Setting it to `true` activates the OTLP exporter. The SDK is always initialised so that span IDs are available in logs even when export is disabled.

## Consequences

- `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`, and `@opentelemetry/exporter-trace-otlp-http` are added to `apps/api`.
- `opentelemetry-sdk-trace-base`, `opentelemetry-api`, and `opentelemetry-instrumentation-*` packages are added to `apps/worker/requirements.txt`.
- The BullMQ job payload type (`Phase6JobPayload`) gains an optional `_otel_context` string field.
- `docker-compose.yml` gains optional `otelcol`, `jaeger`, and `prometheus` services behind a `--profile observability` flag so they do not start by default.
- ADR-003 is updated to document the `_otel_context` field as part of the job envelope contract.
- Alerting rules for queue depth > 100, error rate > 5 %, and p99 latency > 2 s are defined in `infra/alerting/` as a future deliverable.
