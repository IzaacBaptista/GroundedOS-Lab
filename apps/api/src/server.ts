import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { askRag, ApiRequestError, type RagAskRequest } from "./rag-service";

const DEFAULT_PORT = 3001;
const MAX_BODY_BYTES = 1_000_000;

export function createApiServer() {
  return createServer(async (request, response) => {
    try {
      await routeRequest(request, response);
    } catch (error) {
      writeError(response, error);
    }
  });
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, {
      status: "ok",
      service: "groundedos-api",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/rag/ask") {
    const body = await readJsonBody<RagAskRequest>(request);
    const output = await askRag(body);

    writeJson(response, 200, output);
    return;
  }

  writeJson(response, 404, {
    error: {
      message: `Route not found: ${request.method ?? "UNKNOWN"} ${url.pathname}`,
    },
  });
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const contentType = request.headers["content-type"];

  if (!contentType?.includes("application/json")) {
    throw new ApiRequestError("Content-Type must be application/json.", 415);
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > MAX_BODY_BYTES) {
      throw new ApiRequestError("Request body is too large.", 413);
    }

    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8")) as T;
  } catch {
    throw new ApiRequestError("Request body must be valid JSON.");
  }
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown
): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function writeError(response: ServerResponse, error: unknown): void {
  if (error instanceof ApiRequestError) {
    writeJson(response, error.statusCode, {
      error: {
        message: error.message,
      },
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unknown API error.";

  writeJson(response, 500, {
    error: {
      message,
    },
  });
}

if (process.argv[1]?.endsWith("server.ts")) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const server = createApiServer();

  server.listen(port, () => {
    console.log(`GroundedOS API listening on http://localhost:${port}`);
  });
}
