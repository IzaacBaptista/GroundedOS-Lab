import { afterEach, describe, expect, it } from "vitest";

import { createApiServer } from "./server";

const servers: ReturnType<typeof createApiServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("api server", () => {
  it("serves health checks", async () => {
    const app = createTestServer();
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
    const app = createTestServer();
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
    const app = createTestServer();
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
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

  it("returns validation errors as JSON", async () => {
    const app = createTestServer();
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
});

function createTestServer(): ReturnType<typeof createApiServer> {
  const server = createApiServer();
  servers.push(server);

  return server;
}
