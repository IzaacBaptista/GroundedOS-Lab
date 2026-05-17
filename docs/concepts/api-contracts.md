# API Contracts — Structured Contracts & Schema Validation

This document describes the contract conventions used in GroundedOS Lab's HTTP API.  
It covers error response format, success response conventions, input validation, and output validation.

---

## Table of Contents

1. [Error Response Format](#1-error-response-format)
2. [Success Response Conventions](#2-success-response-conventions)
3. [Input Validation](#3-input-validation)
4. [Output Validation](#4-output-validation)
5. [Error Codes Reference](#5-error-codes-reference)
6. [Adding New Schemas](#6-adding-new-schemas)
7. [Request/Response Examples](#7-requestresponse-examples)
8. [Limitations & Next Steps](#8-limitations--next-steps)

---

## 1. Error Response Format

Every error response from the API uses a consistent envelope regardless of the endpoint.

### Schema

```json
{
  "error": {
    "message":          "Human-readable description.",
    "errorCode":        "SYMBOLIC_CODE",
    "requestId":        "req-<fastify-request-id>",
    "validationErrors": [
      { "field": "query",   "message": "Required" },
      { "field": "content", "message": "content must be a non-empty string" }
    ]
  }
}
```

| Field            | Type               | Always present | Notes |
|------------------|--------------------|:--------------:|-------|
| `error.message`  | `string`           | ✅             | Human-readable. Suitable for display. |
| `error.errorCode`| `string`           | ✅             | Symbolic code — see [Error Codes Reference](#5-error-codes-reference). |
| `error.requestId`| `string`           | ✅             | Fastify request ID. Use this when reporting issues. |
| `error.validationErrors` | `Array<{field, message}>` | Only on `VALIDATION_ERROR` | Field-level detail from Zod schema parsing. |

> **Backward compatibility:** `error.message` is the only field that pre-existing clients must read.  
> The additional fields are additive and do not break existing clients that only read `error.message`.

---

## 2. Success Response Conventions

Success responses are **not wrapped** in a generic envelope (e.g., `{ success: true, data: ... }`) for existing endpoints because that would break all current consumers.

Each endpoint returns its own typed response object as documented in `apps/api/src/rag-service.ts` and `apps/api/src/agents/agent.service.ts`.

New endpoints introduced in future phases should adopt the standard success envelope:

```json
{
  "success": true,
  "data":     { ... },
  "metadata": {
    "requestId": "req-123",
    "durationMs": 45
  }
}
```

---

## 3. Input Validation

### How it works

Input validation for critical endpoints uses **Zod schemas** applied at the controller layer via `ZodValidationPipe`.

When validation fails:
- HTTP status `400` is returned.
- `errorCode` is `VALIDATION_ERROR`.
- `validationErrors` lists every failing field with a message.
- **Unknown fields are rejected** (`.strict()` mode in all schemas).

### Validated endpoints

| Endpoint                     | Schema                      | Notes |
|------------------------------|-----------------------------|-------|
| `POST /agents/execute`       | `AgentExecuteRequestSchema` | Strict — rejects extra fields |
| `POST /rag/ask` (JSON body)  | `RagAskRequestBodySchema`   | Strict — rejects extra fields |
| `POST /rag/index` (JSON body)| `RagIndexRequestBodySchema` | Strict — rejects extra fields |

Multipart/form-data paths bypass Zod validation and rely on the service-level `normalizeRequest()` guards.

### Example: missing required field

**Request:**
```http
POST /agents/execute
Content-Type: application/json

{ "agentType": "document-qa" }
```

**Response — 400 VALIDATION_ERROR:**
```json
{
  "error": {
    "message":    "Validation failed.",
    "errorCode":  "VALIDATION_ERROR",
    "requestId":  "req-5",
    "validationErrors": [
      { "field": "query", "message": "query must be a non-empty string" }
    ]
  }
}
```

### Example: unknown extra field

**Request:**
```http
POST /agents/execute
Content-Type: application/json

{
  "agentType": "document-qa",
  "query": "What is RAG?",
  "hackerField": "this should fail"
}
```

**Response — 400 VALIDATION_ERROR:**
```json
{
  "error": {
    "message":    "Validation failed.",
    "errorCode":  "VALIDATION_ERROR",
    "requestId":  "req-6",
    "validationErrors": [
      { "field": "hackerField", "message": "Unrecognized key: \"hackerField\"" }
    ]
  }
}
```

---

## 4. Output Validation

### `/rag/ask` response validation

The `RagAskResponse` object is validated on every `/rag/ask` successful response using `validateRagAskResponse` from `@groundedos/core`.

This validation runs in the `onSend` Fastify hook in `apps/api/src/server.ts`.

If the response fails validation, the hook propagates the error, which results in a 500 response. This prevents malformed responses from reaching clients.

### Agent response validation

Agent responses are not yet validated at the output layer.  
Planned for a future iteration: wrap `AgentExecuteResponse` in `AgentExecuteResponseSchema.parse()` before returning.

---

## 5. Error Codes Reference

| `errorCode`               | HTTP Status | Description |
|---------------------------|:-----------:|-------------|
| `VALIDATION_ERROR`        | 400         | Zod schema validation failure — `validationErrors` array is populated. |
| `BAD_REQUEST`             | 400         | Semantic/business validation failure (e.g., unknown track type). |
| `UNAUTHORIZED`            | 401         | Missing, invalid, or expired auth token / API key. |
| `FORBIDDEN`               | 403         | Authenticated but missing required role. |
| `NOT_FOUND`               | 404         | Resource not found (e.g., index not found for documentId). |
| `CONFLICT`                | 409         | Conflicting state. |
| `UNSUPPORTED_MEDIA_TYPE`  | 415         | Wrong `Content-Type` header. |
| `UNPROCESSABLE_ENTITY`    | 422         | Request is well-formed but semantically unprocessable. |
| `RATE_LIMITED`            | 429         | Per-user rate limit exceeded. Retry after `Retry-After` header seconds. |
| `INTERNAL_ERROR`          | 500         | Unhandled server error. |
| `SERVICE_UNAVAILABLE`     | 503         | Required infrastructure (e.g., Redis) not configured or unavailable. |
| `HTTP_<N>`                | N           | Fallback for status codes not in the table above. |

---

## 6. Adding New Schemas

### Step 1 — Define the schema in `packages/core/src/contracts/api-schemas.ts`

```typescript
export const MyEndpointRequestSchema = z
  .object({
    requiredField: z.string().min(1, "requiredField must be non-empty"),
    optionalField: z.number().int().positive().optional(),
  })
  .strict(); // ← always add .strict() to reject unknown fields

export type MyEndpointRequest = z.infer<typeof MyEndpointRequestSchema>;
```

### Step 2 — Export it from `packages/core/src/contracts/index.ts`

```typescript
export { MyEndpointRequestSchema } from "./api-schemas";
export type { MyEndpointRequest } from "./api-schemas";
```

### Step 3 — Export it from `packages/core/src/index.ts`

```typescript
export { MyEndpointRequestSchema } from "./contracts/index";
export type { MyEndpointRequest } from "./contracts/index";
```

### Step 4 — Apply it in the controller using `ZodValidationPipe`

```typescript
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  MyEndpointRequestSchema,
  type MyEndpointRequest,
} from "@groundedos/core";

@Post("my-endpoint")
async handle(
  @Body(new ZodValidationPipe("MyEndpointRequest", MyEndpointRequestSchema))
  body: MyEndpointRequest
): Promise<MyEndpointResponse> {
  ...
}
```

### Step 5 — Add tests

Create or extend a test file (e.g., `apps/api/src/contracts/contract-validation.test.ts`) covering:
- Valid payload accepted (200 / expected status).
- Missing required field → 400 with `VALIDATION_ERROR`.
- Empty string on a required `.min(1)` field → 400 with field-level error.
- Unknown extra field → 400 with `VALIDATION_ERROR`.
- Optionally: wrong type (number where string expected).

---

## 7. Request/Response Examples

### POST /agents/execute — Success

**Request:**
```http
POST /agents/execute
Content-Type: application/json

{
  "agentType": "document-qa",
  "query":     "What is retrieval augmented generation?",
  "devMode":   true
}
```

**Response — 200 OK:**
```json
{
  "success":   true,
  "answer":    "Retrieval augmented generation (RAG) combines a retrieval step ...",
  "sources":   ["section-1", "section-2"],
  "reasoning": ["Searching index for relevant context", "Found 3 chunks"],
  "devMode": {
    "toolCalls":  [...],
    "durationMs": 312
  }
}
```

---

### POST /rag/ask — JSON body, inline content

**Request:**
```http
POST /rag/ask
Content-Type: application/json

{
  "content": "Alpha notes.\n\nBeta notes about retrieval metrics.",
  "query":   "What mentions retrieval?",
  "topK":    1
}
```

**Response — 200 OK:** (see `RagAskResponse` type in `apps/api/src/rag-service.ts`)

---

### POST /rag/ask — Query persisted index

**Request:**
```http
POST /rag/ask
Content-Type: application/json

{
  "documentId": "my-document-id",
  "query":      "What is the main topic?"
}
```

---

### POST /rag/index — Index a document

**Request:**
```http
POST /rag/index
Content-Type: application/json

{
  "type":             "text",
  "content":          "My document content here.",
  "title":            "My Document",
  "documentId":       "my-doc-001",
  "embeddingProvider": "local-hash"
}
```

---

## 8. Limitations & Next Steps

### Known limitations

- **Multipart paths** are not validated with Zod. They rely on service-level guards in `rag-service.ts`.
- **Agent response** (`AgentExecuteResponse`) is not yet validated at the output layer.
- **Observability/eval endpoints** do not yet have Zod schemas.
- **Admin endpoints** do not yet have Zod schemas.
- **requestId** is Fastify's internal sequential counter, not a UUID. For high-volume systems, consider switching to UUID generation.

### Recommended next steps

1. **Add Zod output validation** for `POST /agents/execute` — parse the response through `AgentExecuteResponseSchema` before returning.
2. **Add schemas** for admin and observability endpoints.
3. **Add `requestId` header** to successful responses for end-to-end traceability.
4. **Propagate requestId to logs** for correlation between HTTP logs and application logs.
5. **Validate multipart fields** using a shared Zod helper for multipart field maps.

---

## Related

- [ADR-007 Runtime Validation Strategy](../adr/ADR-007-runtime-validation-strategy.md)
- [Data Contracts & Schemas](./data-contracts.md)
- Source: `packages/core/src/contracts/api-schemas.ts`
- Source: `apps/api/src/common/zod-validation.pipe.ts`
- Source: `apps/api/src/common/api-exception.filter.ts`
