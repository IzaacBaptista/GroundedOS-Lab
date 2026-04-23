import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { basename, join } from "path";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import multipart from "@fastify/multipart";
import {
  ApiRequestError,
  askRag,
  askRagFromFile,
  deletePersistedRagIndex,
  indexRag,
  indexRagFromFile,
  listPersistedRagIndexes,
  type RagIndexFileRequest,
  type RagIndexRequest,
  type RagAskFileRequest,
  type RagAskRequest,
} from "./rag-service";

const DEFAULT_PORT = 3001;
const MAX_UPLOAD_BYTES = 5_000_000;

export type ApiServerOptions = {
  indexDir?: string;
};

export function createApiServer(options: ApiServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: false,
  });

  app.register(multipart, {
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
      files: 1,
      fields: 8,
      parts: 10,
    },
  });

  app.setErrorHandler((error, _request, reply) => {
    writeError(reply, error);
  });

  app.get("/health", async () => {
    return {
      status: "ok",
      service: "groundedos-api",
    };
  });

  app.get("/rag/indexes", async () => {
    return await listPersistedRagIndexes(options.indexDir);
  });

  app.delete("/rag/indexes/:documentId", async (request) => {
    const params = request.params as { documentId?: string };

    return await deletePersistedRagIndex(params.documentId ?? "", options.indexDir);
  });

  app.post("/rag/ask", async (request, _reply) => {
    if (request.isMultipart()) {
      return await handleMultipartRagAsk(request, options.indexDir);
    }

    const contentType = request.headers["content-type"];

    if (!contentType?.includes("application/json")) {
      throw new ApiRequestError(
        "Content-Type must be application/json or multipart/form-data.",
        415
      );
    }

    return await askRag(
      withIndexDir(request.body, options.indexDir) as RagAskRequest
    );
  });

  app.post("/rag/index", async (request, _reply) => {
    if (request.isMultipart()) {
      return await handleMultipartRagIndex(request, options.indexDir);
    }

    const contentType = request.headers["content-type"];

    if (!contentType?.includes("application/json")) {
      throw new ApiRequestError(
        "Content-Type must be application/json or multipart/form-data.",
        415
      );
    }

    return await indexRag(
      withIndexDir(request.body, options.indexDir) as RagIndexRequest
    );
  });

  return app;
}

async function handleMultipartRagAsk(request: FastifyRequest, indexDir: string | undefined) {
  const fields: Record<string, string> = {};
  let upload:
    | {
        buffer: Buffer;
        filename: string;
      }
    | undefined;

  for await (const part of request.parts()) {
    if (part.type === "file") {
      if (upload) {
        throw new ApiRequestError("Only one file upload is supported.");
      }

      upload = {
        buffer: await part.toBuffer(),
        filename: sanitizeFilename(part.filename || "upload.txt"),
      };
      continue;
    }

    if (part.type === "field") {
      fields[part.fieldname] = String(part.value ?? "");
    }
  }

  if (!upload) {
    throw new ApiRequestError("file upload is required.");
  }

  const tempDir = await mkdtemp(join(tmpdir(), "groundedos-api-upload-"));
  const tempFilePath = join(tempDir, upload.filename);

  try {
    await writeFile(tempFilePath, upload.buffer);

    return await askRagFromFile({
      filePath: tempFilePath,
      originalFilename: upload.filename,
      type: fields.type as RagAskFileRequest["type"],
      query: fields.query,
      topK: fields.topK ? parsePositiveInteger(fields.topK, "topK") : undefined,
      title: fields.title,
      documentId: fields.documentId,
      metadata: parseMetadata(fields.metadata),
      embeddingProvider: fields.embeddingProvider as RagAskFileRequest["embeddingProvider"],
      indexDir,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function handleMultipartRagIndex(request: FastifyRequest, indexDir: string | undefined) {
  const fields: Record<string, string> = {};
  let upload:
    | {
        buffer: Buffer;
        filename: string;
      }
    | undefined;

  for await (const part of request.parts()) {
    if (part.type === "file") {
      if (upload) {
        throw new ApiRequestError("Only one file upload is supported.");
      }

      upload = {
        buffer: await part.toBuffer(),
        filename: sanitizeFilename(part.filename || "upload.txt"),
      };
      continue;
    }

    if (part.type === "field") {
      fields[part.fieldname] = String(part.value ?? "");
    }
  }

  if (!upload) {
    throw new ApiRequestError("file upload is required.");
  }

  const tempDir = await mkdtemp(join(tmpdir(), "groundedos-api-upload-"));
  const tempFilePath = join(tempDir, upload.filename);

  try {
    await writeFile(tempFilePath, upload.buffer);

    return await indexRagFromFile({
      filePath: tempFilePath,
      originalFilename: upload.filename,
      type: fields.type as RagIndexFileRequest["type"],
      title: fields.title,
      documentId: fields.documentId,
      metadata: parseMetadata(fields.metadata),
      embeddingProvider: fields.embeddingProvider as RagIndexFileRequest["embeddingProvider"],
      indexDir,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function writeError(reply: FastifyReply, error: unknown): void {
  if (error instanceof ApiRequestError) {
    reply.status(error.statusCode).send({
      error: {
        message: error.message,
      },
    });
    return;
  }

  const fastifyError = error as {
    statusCode?: number;
    message?: string;
  };
  const statusCode =
    typeof fastifyError.statusCode === "number" && fastifyError.statusCode >= 400
      ? fastifyError.statusCode
      : 500;
  const message = fastifyError.message ?? "Unknown API error.";

  reply.status(statusCode).send({
    error: {
      message,
    },
  });
}

function parsePositiveInteger(value: string, fieldName: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiRequestError(`${fieldName} must be a positive integer.`);
  }

  return parsed;
}

function parseMetadata(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const metadata = JSON.parse(value) as unknown;

    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new ApiRequestError("metadata must be a JSON object.");
    }

    return metadata as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiRequestError) {
      throw error;
    }

    throw new ApiRequestError("metadata must be valid JSON.");
  }
}

function withIndexDir(body: unknown, indexDir: string | undefined): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }

  return {
    ...body,
    indexDir,
  };
}

function sanitizeFilename(filename: string): string {
  const safe = basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");

  return safe.length > 0 ? safe : "upload.txt";
}

if (process.argv[1]?.endsWith("server.ts")) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const app = createApiServer();

  await app.listen({ port, host: "0.0.0.0" });
  console.log(`GroundedOS API listening on http://localhost:${port}`);
}
