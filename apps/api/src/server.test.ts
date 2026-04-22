import { once } from "events";
import type { AddressInfo } from "net";
import { afterEach, describe, expect, it } from "vitest";

import { createApiServer } from "./server";

const servers: ReturnType<typeof createApiServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        })
    )
  );
});

describe("api server", () => {
  it("serves health checks", async () => {
    const baseUrl = await listen();
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "groundedos-api",
    });
  });

  it("serves POST /rag/ask", async () => {
    const baseUrl = await listen();
    const response = await fetch(`${baseUrl}/rag/ask`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "text",
        content:
          "Alpha setup notes.\n\nBeta retrieval notes explain vector search.",
        query: "What explains vector search?",
        title: "HTTP API Test",
        documentId: "http-api-test",
        topK: 1,
      }),
    });
    const body = (await response.json()) as {
      answer: { grounded: boolean; text: string };
      devMode: { results: Array<{ chunkId: string }> };
    };

    expect(response.status).toBe(200);
    expect(body.answer.grounded).toBe(true);
    expect(body.answer.text).toContain("Beta retrieval notes explain vector search.");
    expect(body.devMode.results[0]?.chunkId).toBe("http-api-test:section-2:chunk-1");
  });

  it("returns validation errors as JSON", async () => {
    const baseUrl = await listen();
    const response = await fetch(`${baseUrl}/rag/ask`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "text",
        content: "",
        query: "x",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        message: "content must be a non-empty string.",
      },
    });
  });
});

async function listen(): Promise<string> {
  const server = createApiServer();
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;

  return `http://127.0.0.1:${address.port}`;
}
