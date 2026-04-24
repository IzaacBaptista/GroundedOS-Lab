import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

import { createApiServer } from "./server";

const servers: NestFastifyApplication[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true, force: true }))
  );
});

describe("api server", () => {
  it("serves health checks", async () => {
    const app = await createTestServer();
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "groundedos-api",
    });
  });

  it("serves JSON POST /rag/ask", async () => {
    const app = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/rag/ask",
      payload: {
        type: "text",
        content:
          "Alpha setup notes.\n\nBeta retrieval notes explain vector search.",
        query: "What explains vector search?",
        title: "HTTP API Test",
        documentId: "http-api-test",
        topK: 1,
      },
    });
    const body = response.json() as {
      answer: { grounded: boolean; text: string };
      devMode: { results: Array<{ chunkId: string }> };
    };

    expect(response.statusCode).toBe(200);
    expect(body.answer.grounded).toBe(true);
    expect(body.answer.text).toContain("Beta retrieval notes explain vector search.");
    expect(body.devMode.results[0]?.chunkId).toBe("http-api-test:section-2:chunk-1");
  });

  it("serves multipart POST /rag/ask", async () => {
    const app = await createTestServer();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = await app.getUrl();
    const form = new FormData();

    form.append(
      "file",
      new Blob([
        "Alpha setup notes.\n\nBeta retrieval notes explain vector search.",
      ], { type: "text/plain" }),
      "notes.txt"
    );
    form.append("type", "text");
    form.append("query", "What explains vector search?");
    form.append("title", "Multipart API Test");
    form.append("documentId", "multipart-api-test");
    form.append("topK", "1");

    const response = await fetch(`${address}/rag/ask`, {
      method: "POST",
      body: form,
    });
    const body = (await response.json()) as {
      document: { originalFilename?: string };
      answer: { grounded: boolean; text: string };
      devMode: { results: Array<{ chunkId: string }> };
    };

    expect(response.status).toBe(200);
    expect(body.document.originalFilename).toBe("notes.txt");
    expect(body.answer.grounded).toBe(true);
    expect(body.answer.text).toContain("Beta retrieval notes explain vector search.");
    expect(body.devMode.results[0]?.chunkId).toBe("multipart-api-test:section-2:chunk-1");
  });

  it("serves POST /rag/index and asks against the persisted index", async () => {
    const indexDir = await createTempIndexDir();
    const app = await createTestServer(indexDir);
    const indexResponse = await app.inject({
      method: "POST",
      url: "/rag/index",
      payload: {
        type: "text",
        content:
          "Alpha setup notes.\n\nBeta retrieval notes explain vector search.",
        title: "Persisted HTTP Test",
        documentId: "persisted-http-test",
        embeddingProvider: "local-hash",
      },
    });
    const indexBody = indexResponse.json() as {
      storage: { persisted: boolean; indexPath: string };
      index: { chunkCount: number; embeddingProvider: string; embeddingModel?: { model: string } };
    };

    expect(indexResponse.statusCode).toBe(200);
    expect(indexBody.storage.persisted).toBe(true);
    expect(indexBody.storage.indexPath).toContain("groundedos-api-server-test-");
    expect(indexBody.index.chunkCount).toBe(2);
    expect(indexBody.index.embeddingProvider).toBe("local-hash");
    expect(indexBody.index.embeddingModel?.model).toBe("local-hash-v1");

    const askResponse = await app.inject({
      method: "POST",
      url: "/rag/ask",
      payload: {
        documentId: "persisted-http-test",
        query: "What explains vector search?",
        topK: 1,
      },
    });
    const askBody = askResponse.json() as {
      answer: { grounded: boolean; text: string };
      index: { embeddingProvider: string };
      storage?: { persisted: boolean };
      devMode: { results: Array<{ chunkId: string }> };
    };

    expect(askResponse.statusCode).toBe(200);
    expect(askBody.index.embeddingProvider).toBe("local-hash");
    expect(askBody.storage?.persisted).toBe(true);
    expect(askBody.answer.grounded).toBe(true);
    expect(askBody.answer.text).toContain("Beta retrieval notes explain vector search.");
    expect(askBody.devMode.results[0]?.chunkId).toBe(
      "persisted-http-test:section-2:chunk-1"
    );
  });

  it("serves GET and DELETE /rag/indexes", async () => {
    const indexDir = await createTempIndexDir();
    const app = await createTestServer(indexDir);

    await app.inject({
      method: "POST",
      url: "/rag/index",
      payload: {
        type: "text",
        content:
          "Alpha setup notes.\n\nBeta retrieval notes explain vector search.",
        title: "Managed HTTP Test",
        documentId: "managed-http-test",
      },
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/rag/indexes",
    });
    const listBody = listResponse.json() as {
      count: number;
      indexes: Array<{ document: { documentId: string; title: string } }>;
    };

    expect(listResponse.statusCode).toBe(200);
    expect(listBody.count).toBe(1);
    expect(listBody.indexes[0]?.document).toMatchObject({
      documentId: "managed-http-test",
      title: "Managed HTTP Test",
    });

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/rag/indexes/managed-http-test",
    });

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toMatchObject({
      deleted: true,
      index: {
        document: {
          documentId: "managed-http-test",
        },
      },
    });

    const emptyListResponse = await app.inject({
      method: "GET",
      url: "/rag/indexes",
    });

    expect(emptyListResponse.json()).toEqual({
      count: 0,
      indexes: [],
    });
  });

  it("returns validation errors as JSON", async () => {
    const app = await createTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/rag/ask",
      payload: {
        type: "text",
        content: "",
        query: "x",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        message: "content must be a non-empty string.",
      },
    });
  });

  it("serves GET /rag/metrics/tradeoffs", async () => {
    const app = await createTestServer();

    await app.inject({
      method: "POST",
      url: "/rag/ask",
      payload: {
        type: "text",
        content: "Alpha notes.\n\nBeta notes about retrieval metrics.",
        query: "What mentions retrieval?",
        topK: 1,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/rag/metrics/tradeoffs",
    });
    const body = response.json() as {
      totals: { requests: number };
      providers: Array<{ provider: string; requests: number }>;
      recent: Array<{ requestId: string }>;
    };

    expect(response.statusCode).toBe(200);
    expect(body.totals.requests).toBeGreaterThanOrEqual(1);
    expect(body.providers.length).toBeGreaterThanOrEqual(1);
    expect(body.recent.length).toBeGreaterThanOrEqual(1);
  });

  it("serves GET /rag/memory/:sessionId", async () => {
    const app = await createTestServer();
    const sessionId = `session-http-${Date.now()}`;

    await app.inject({
      method: "POST",
      url: "/rag/ask",
      payload: {
        type: "text",
        content: "Alpha notes.\n\nBeta notes about retrieval metrics.",
        query: "What mentions retrieval?",
        topK: 1,
        sessionId,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: `/rag/memory/${encodeURIComponent(sessionId)}`,
    });
    const body = response.json() as {
      sessionId: string;
      count: number;
      entries: Array<{ query: string; answer: string }>;
    };

    expect(response.statusCode).toBe(200);
    expect(body.sessionId).toBe(sessionId);
    expect(body.count).toBeGreaterThanOrEqual(1);
    expect(body.entries[0]?.query).toBeTruthy();
  });
});

async function createTestServer(indexDir?: string): Promise<NestFastifyApplication> {
  const server = await createApiServer({ indexDir });
  servers.push(server);

  return server;
}

async function createTempIndexDir(): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "groundedos-api-server-test-"));
  tempDirs.push(tempDir);

  return tempDir;
}
