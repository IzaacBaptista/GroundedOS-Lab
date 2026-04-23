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
