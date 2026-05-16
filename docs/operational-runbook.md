# Operational Runbook

Practical operator guide for local runtime flows in GroundedOS Lab.

## Scope

This runbook covers:

- Auth-enabled API/web local execution
- Async jobs queue execution with BullMQ + Redis
- Common operational failures and quick recovery steps

## Auth Runtime Behavior

Auth enforcement resolution:

- `AUTH_ENFORCEMENT=true`: always enforce auth
- `AUTH_ENFORCEMENT=false`: always allow anonymous access
- unset `AUTH_ENFORCEMENT`:
  - `NODE_ENV=development` or `test` -> anonymous by default
  - other environments -> auth enforced by default

## Local Auth Flow

Start API with auth explicitly enabled:

```bash
AUTH_ENFORCEMENT=true npm run api:dev
```

Start web app:

```bash
npm run web:dev
```

Default local credentials:

- username: `admin`
- password: `admin-password`

Login endpoints:

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`

## Async Jobs Flow

Queue-backed endpoints:

- `POST /jobs/phase5`
- `POST /jobs/model-benchmark`
- `GET /jobs/:jobId`
- `GET /jobs/metrics`

Start API and worker in separate terminals:

```bash
npm run api:dev
npm run api:jobs:worker
```

Enqueue (bearer token):

```bash
curl -X POST http://localhost:3001/jobs/phase5 \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <access-token>' \
  -d '{"track":"quantization"}'
```

Enqueue (API key):

```bash
curl -X POST http://localhost:3001/jobs/phase5 \
  -H 'content-type: application/json' \
  -H 'x-api-key: <api-key>' \
  -d '{"track":"quantization"}'
```

Capture `jobId` with `jq`:

```bash
JOB_ID=$(curl -s -X POST http://localhost:3001/jobs/phase5 \
  -H 'content-type: application/json' \
  -H 'x-api-key: <api-key>' \
  -d '{"track":"quantization"}' | jq -r '.jobId')
```

Poll job status:

```bash
curl "http://localhost:3001/jobs/${JOB_ID}" \
  -H 'x-api-key: <api-key>'

Read queue metrics snapshot:

```bash
curl "http://localhost:3001/jobs/metrics" \
  -H 'x-api-key: <api-key>'
```

## Queue Hardening Behavior

- Retry policy is configured per job type (centralized in code).
- Supported backoff types: fixed and exponential.
- Exhausted jobs are copied to DLQ with envelope metadata for triage/re-drive.
- Correlation IDs are accepted in enqueue payload and logged when present.
- Lifecycle logs are structured (created, started, completed, failed, retry, dlq).
```

## Required Queue Configuration

At least one option must be configured:

- `REDIS_URL`
- `REDIS_HOST` and `REDIS_PORT` (optional `REDIS_PASSWORD`)

If Redis is not configured:

- API `/jobs/*` endpoints return `503`
- worker exits with a queue configuration error

## Troubleshooting

- `401 Authentication required`
  - add `Authorization: Bearer <access-token>` or `x-api-key`
- `401 Invalid or expired token`
  - refresh using `POST /auth/refresh` or login again
- `404 Job <id> not found`
  - verify `jobId` comes from the same Redis environment
- `503 Async job queue is not configured`
  - set Redis env vars and restart API + worker
- jobs remain in `waiting`
  - ensure worker process is running and Redis is reachable
  - validate command execution in worker environment, for example:
    - `npm run experiment:quantization`
