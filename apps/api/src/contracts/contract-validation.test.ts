/**
 * Contract validation tests — structured contracts & schema validation.
 *
 * These integration tests verify that:
 * - Valid payloads are accepted and processed correctly.
 * - Invalid payloads (missing fields, wrong types, extra fields) are
 *   rejected with a structured 400 error response.
 * - Every error response carries `errorCode` and `requestId`.
 * - Zod validation errors carry field-level detail in `validationErrors`.
 * - Error codes are consistent with HTTP status codes.
 */

import { afterEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApiServer } from "../server";

const servers: NestFastifyApplication[] = [];

process.env.AUTH_ENFORCEMENT = "false";

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

async function createTestServer(): Promise<NestFastifyApplication> {
  const server = await createApiServer();
  servers.push(server);
  return server;
}

// ---------------------------------------------------------------------------
// Error envelope contract
// ---------------------------------------------------------------------------

describe("error envelope contract", () => {
  it("error responses always include errorCode and requestId", async () => {
    const app = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/agents/execute",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as {
      error: { message: string; errorCode: string; requestId: string };
    };
    expect(body.error.errorCode).toBeDefined();
    expect(typeof body.error.errorCode).toBe("string");
    expect(body.error.requestId).toBeDefined();
    expect(typeof body.error.requestId).toBe("string");
  });

  it("validation errors carry field-level detail in validationErrors", async () => {
    const app = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/agents/execute",
      payload: { agentType: "document-qa" /* missing query */ },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as {
      error: {
        errorCode: string;
        validationErrors: Array<{ field: string; message: string }>;
      };
    };
    expect(body.error.errorCode).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.error.validationErrors)).toBe(true);
    expect(body.error.validationErrors.length).toBeGreaterThan(0);
    expect(body.error.validationErrors[0]).toHaveProperty("field");
    expect(body.error.validationErrors[0]).toHaveProperty("message");
  });

  it("errorCode matches status 400 → BAD_REQUEST for ApiRequestError", async () => {
    const app = await createTestServer();
    // /jobs/phase5 throws ApiRequestError when track is missing
    const response = await app.inject({
      method: "POST",
      url: "/jobs/phase5",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as { error: { errorCode: string } };
    expect(body.error.errorCode).toBe("BAD_REQUEST");
  });
});

// ---------------------------------------------------------------------------
// POST /agents/execute — input contract
// ---------------------------------------------------------------------------

describe("POST /agents/execute — input contract", () => {
  it("accepts a valid request payload", async () => {
    const app = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/agents/execute",
      payload: {
        agentType: "document-qa",
        query: "What is retrieval augmented generation?",
        devMode: false,
      },
    });

    // Agent will likely return no answer without a real index, but must not be 400.
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      success: boolean;
      sources: string[];
      reasoning: string[];
    };
    expect(typeof body.success).toBe("boolean");
    expect(Array.isArray(body.sources)).toBe(true);
    expect(Array.isArray(body.reasoning)).toBe(true);
  });

  it("rejects when query is missing", async () => {
    const app = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/agents/execute",
      payload: { agentType: "document-qa" },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as {
      error: {
        errorCode: string;
        validationErrors: Array<{ field: string; message: string }>;
      };
    };
    expect(body.error.errorCode).toBe("VALIDATION_ERROR");
    expect(body.error.validationErrors).toContainEqual(
      expect.objectContaining({ field: "query" })
    );
  });

  it("rejects when agentType is missing", async () => {
    const app = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/agents/execute",
      payload: { query: "What is RAG?" },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as {
      error: { errorCode: string; validationErrors: Array<{ field: string }> };
    };
    expect(body.error.errorCode).toBe("VALIDATION_ERROR");
    expect(body.error.validationErrors).toContainEqual(
      expect.objectContaining({ field: "agentType" })
    );
  });

  it("rejects unknown agentType value", async () => {
    const app = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/agents/execute",
      payload: { agentType: "unknown-agent", query: "test" },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as { error: { errorCode: string } };
    expect(body.error.errorCode).toBe("VALIDATION_ERROR");
  });

  it("rejects unknown extra fields (strict mode)", async () => {
    const app = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/agents/execute",
      payload: {
        agentType: "document-qa",
        query: "test",
        unknownField: "should be rejected",
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as { error: { errorCode: string } };
    expect(body.error.errorCode).toBe("VALIDATION_ERROR");
  });

  it("rejects empty query string", async () => {
    const app = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/agents/execute",
      payload: { agentType: "document-qa", query: "" },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as {
      error: { errorCode: string; validationErrors: Array<{ field: string }> };
    };
    expect(body.error.errorCode).toBe("VALIDATION_ERROR");
    expect(body.error.validationErrors).toContainEqual(
      expect.objectContaining({ field: "query" })
    );
  });

  it("rejects maxSteps exceeding the allowed limit", async () => {
    const app = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/agents/execute",
      payload: { agentType: "document-qa", query: "test", maxSteps: 999 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { errorCode: "VALIDATION_ERROR" },
    });
  });

  it("returns multiple field errors when several fields are invalid", async () => {
    const app = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/agents/execute",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as {
      error: { validationErrors: Array<{ field: string }> };
    };
    // Both agentType and query are missing
    expect(body.error.validationErrors.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// POST /rag/ask (JSON) — input contract
// ---------------------------------------------------------------------------

describe("POST /rag/ask — JSON input contract", () => {
  it("rejects unknown extra fields (strict mode)", async () => {
    const app = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/rag/ask",
      payload: {
        content: "Hello world",
        query: "What is this?",
        unknownExtra: "should-be-rejected",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { errorCode: "VALIDATION_ERROR" },
    });
  });

  it("rejects empty content string", async () => {
    const app = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/rag/ask",
      payload: { content: "", query: "test" },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as {
      error: { errorCode: string; validationErrors: Array<{ field: string }> };
    };
    expect(body.error.errorCode).toBe("VALIDATION_ERROR");
    expect(body.error.validationErrors).toContainEqual(
      expect.objectContaining({ field: "content" })
    );
  });

  it("rejects missing query", async () => {
    const app = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/rag/ask",
      payload: { content: "Some content" },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as {
      error: { errorCode: string; validationErrors: Array<{ field: string }> };
    };
    expect(body.error.errorCode).toBe("VALIDATION_ERROR");
    expect(body.error.validationErrors).toContainEqual(
      expect.objectContaining({ field: "query" })
    );
  });

  it("rejects wrong Content-Type with 415 and errorCode UNSUPPORTED_MEDIA_TYPE", async () => {
    const app = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/rag/ask",
      headers: { "content-type": "text/plain" },
      payload: "just plain text",
    });

    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({
      error: { errorCode: "UNSUPPORTED_MEDIA_TYPE" },
    });
  });

  it("accepts a persisted-index ask without content field", async () => {
    const app = await createTestServer();
    // Query against a non-existent persisted index → service returns 404
    const response = await app.inject({
      method: "POST",
      url: "/rag/ask",
      payload: {
        documentId: "non-existent-doc-id",
        query: "What is this?",
      },
    });

    // Schema accepts this shape; business logic returns 404 for missing index
    expect(response.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /rag/index (JSON) — input contract
// ---------------------------------------------------------------------------

describe("POST /rag/index — JSON input contract", () => {
  it("rejects empty content string", async () => {
    const app = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/rag/index",
      payload: { content: "", title: "Test" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        errorCode: "VALIDATION_ERROR",
        validationErrors: expect.arrayContaining([
          expect.objectContaining({ field: "content" }),
        ]),
      },
    });
  });

  it("rejects unknown extra fields (strict mode)", async () => {
    const app = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/rag/index",
      payload: {
        content: "test content",
        unknownField: "should be rejected",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { errorCode: "VALIDATION_ERROR" },
    });
  });
});
