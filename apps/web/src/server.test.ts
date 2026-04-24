import { createServer, type Server } from "http";
import { once } from "events";
import type { AddressInfo } from "net";
import { afterEach, describe, expect, it } from "vitest";

import { createWebServer } from "./server";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(closeServer));
});

describe("web server", () => {
  it("serves the local RAG console", async () => {
    const baseUrl = await listen(createWebServer());
    const response = await fetch(`${baseUrl}/`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("Local RAG Console");
  });

  it("proxies API requests", async () => {
    const apiBaseUrl = await listen(
      createServer((_request, response) => {
        response.writeHead(200, {
          "content-type": "application/json",
        });
        response.end(JSON.stringify({ status: "ok", service: "fake-api" }));
      })
    );
    const webBaseUrl = await listen(createWebServer({ apiBaseUrl }));
    const response = await fetch(`${webBaseUrl}/api/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "fake-api",
    });
  });

  it("serves static CSS files with the correct content-type", async () => {
    const baseUrl = await listen(createWebServer());
    const response = await fetch(`${baseUrl}/styles.css`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/css");
  });

  it("returns 404 for a path that does not exist in the public directory", async () => {
    const baseUrl = await listen(createWebServer());
    const response = await fetch(`${baseUrl}/does-not-exist.html`);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: "Static asset not found." },
    });
  });

  it("returns 502 when the API is unreachable during proxying", async () => {
    const webBaseUrl = await listen(
      createWebServer({ apiBaseUrl: "http://127.0.0.1:1" })
    );
    const response = await fetch(`${webBaseUrl}/api/health`);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        message: expect.stringContaining("not reachable"),
      },
    });
  });

  it("blocks path traversal attempts outside the public directory", async () => {
    const baseUrl = await listen(createWebServer());
    const response = await fetch(`${baseUrl}/../package.json`);

    expect(response.status).toBe(404);
  });
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;

  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
