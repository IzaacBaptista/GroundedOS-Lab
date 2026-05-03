import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { basename, join } from "path";
import type { FastifyRequest } from "fastify";
import { ApiRequestError } from "../errors";

const MAX_UPLOAD_BYTES = 5_000_000;

export type MultipartExtract = {
  fields: Record<string, string>;
  upload: {
    buffer: Buffer;
    filename: string;
  };
};

/**
 * Extracts a single file upload and any companion form fields from a Fastify
 * multipart request. Mirrors the behaviour of the previous Fastify handlers:
 * only one file is accepted and the filename is sanitised before it is used
 * as a temp-file name.
 */
export async function extractMultipart(request: FastifyRequest): Promise<MultipartExtract> {
  const fields: Record<string, string> = {};
  let upload: MultipartExtract["upload"] | undefined;

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

  return { fields, upload };
}

/**
 * Writes the uploaded buffer to a fresh temp directory, runs {@link handler},
 * and cleans up the directory regardless of success/failure.
 */
export async function withTempUpload<T>(
  upload: MultipartExtract["upload"],
  handler: (tempFilePath: string) => Promise<T>
): Promise<T> {
  const tempDir = await mkdtemp(join(tmpdir(), "groundedos-api-upload-"));
  const tempFilePath = join(tempDir, upload.filename);

  try {
    await writeFile(tempFilePath, upload.buffer);
    return await handler(tempFilePath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function parsePositiveInteger(value: string | undefined, fieldName: string): number | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiRequestError(`${fieldName} must be a positive integer.`);
  }

  return parsed;
}

export function parseBoolean(value: string | undefined, fieldName: string): boolean | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new ApiRequestError(`${fieldName} must be "true" or "false".`);
}

export function parseMetadata(value: string | undefined): Record<string, unknown> | undefined {
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

export const MULTIPART_LIMITS = {
  fileSize: MAX_UPLOAD_BYTES,
  files: 1,
  fields: 12,
  parts: 14,
};
