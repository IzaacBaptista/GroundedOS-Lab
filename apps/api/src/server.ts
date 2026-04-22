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
  type RagAskFileRequest,
  type RagAskRequest,
} from "./rag-service";

const DEFAULT_PORT = 3001;
const MAX_UPLOAD_BYTES = 5_000_000;

export function createApiServer(): FastifyInstance {
  const app = Fastify({
    logger: false,
  });

  app.register(multipart, {
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
      files: 1,
      fields: 6,
      parts: 8,
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

  app.post("/rag/ask", async (request, _reply) => {
    if (request.isMultipart()) {
      return await handleMultipartRagAsk(request);
    }

    const contentType = request.headers["content-type"];

    if (!contentType?.includes("application/json")) {
      throw new ApiRequestError(
        "Content-Type must be application/json or multipart/form-data.",
        415
      );
    }

    return await askRag(request.body as RagAskRequest);
  });

  return app;
}

async function handleMultipartRagAsk(request: FastifyRequest) {
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
