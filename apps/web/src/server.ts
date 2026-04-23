import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { readFile } from "fs/promises";
import { extname, join, normalize } from "path";
import { fileURLToPath } from "url";

const DEFAULT_PORT = 3000;
const DEFAULT_API_BASE_URL = "http://localhost:3001";
const PUBLIC_DIR = fileURLToPath(new URL("./public", import.meta.url));
const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

export function createWebServer(options: WebServerOptions = {}) {
  const apiBaseUrl = options.apiBaseUrl ?? process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL;

  return createServer(async (request, response) => {
    try {
      await routeRequest(request, response, apiBaseUrl);
    } catch (error) {
      writeJson(response, 500, {
        error: {
          message: error instanceof Error ? error.message : "Unknown web server error.",
        },
      });
    }
  });
}

export type WebServerOptions = {
  apiBaseUrl?: string;
};

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  apiBaseUrl: string
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (url.pathname.startsWith("/api/")) {
    await proxyApiRequest(request, response, url, apiBaseUrl);
    return;
  }

  await serveStaticFile(response, url.pathname);
}

async function proxyApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  apiBaseUrl: string
): Promise<void> {
  const targetPath = `${url.pathname.replace(/^\/api/, "")}${url.search}`;
  const targetUrl = new URL(targetPath, apiBaseUrl);
  const body = shouldForwardBody(request.method) ? await readRequestBody(request) : undefined;
  const headers = createProxyHeaders(request);

  try {
    const apiResponse = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
    });
    const apiBody = Buffer.from(await apiResponse.arrayBuffer());

    response.writeHead(apiResponse.status, Object.fromEntries(apiResponse.headers.entries()));
    response.end(apiBody);
  } catch {
    writeJson(response, 502, {
      error: {
        message: `GroundedOS API is not reachable at ${apiBaseUrl}.`,
      },
    });
  }
}

async function serveStaticFile(response: ServerResponse, pathname: string): Promise<void> {
  const filePath = resolveStaticPath(pathname);

  if (!filePath) {
    writeJson(response, 404, {
      error: {
        message: "Static asset not found.",
      },
    });
    return;
  }

  try {
    const contents = await readFile(filePath);
    const contentType = MIME_TYPES[extname(filePath)] ?? "application/octet-stream";

    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": contentType,
    });
    response.end(contents);
  } catch {
    writeJson(response, 404, {
      error: {
        message: "Static asset not found.",
      },
    });
  }
}

function resolveStaticPath(pathname: string): string | undefined {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const normalizedPath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(PUBLIC_DIR, normalizedPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    return undefined;
  }

  return filePath;
}

function createProxyHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  const blockedHeaders = new Set([
    "connection",
    "host",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ]);

  for (const [name, value] of Object.entries(request.headers)) {
    if (blockedHeaders.has(name) || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const headerValue of value) {
        headers.append(name, headerValue);
      }
      continue;
    }

    headers.set(name, value);
  }

  return headers;
}

async function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function shouldForwardBody(method: string | undefined): boolean {
  return method !== "GET" && method !== "HEAD" && method !== undefined;
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

if (process.argv[1]?.endsWith("server.ts")) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const server = createWebServer();

  server.listen(port, () => {
    console.log(`GroundedOS web listening on http://localhost:${port}`);
  });
}
