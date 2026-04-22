import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join, relative } from "path";
import type { EmbeddedChunk } from "@groundedos/rag";

import { ApiRequestError } from "./errors";
import type { RagDocumentSummary, RagIndexSummary } from "./rag-service";

const SCHEMA_VERSION = 1;
const DEFAULT_INDEX_DIR = ".groundedos/indexes";

export type PersistedRagIndex = {
  schemaVersion: typeof SCHEMA_VERSION;
  createdAt: string;
  document: RagDocumentSummary;
  index: RagIndexSummary;
  embeddedChunks: EmbeddedChunk[];
};

export type SavedRagIndex = {
  record: PersistedRagIndex;
  indexPath: string;
  relativeIndexPath: string;
};

export function resolveIndexDir(indexDir?: string): string {
  return indexDir ?? process.env.GROUNDEDOS_INDEX_DIR ?? DEFAULT_INDEX_DIR;
}

export async function saveRagIndex(
  record: Omit<PersistedRagIndex, "schemaVersion" | "createdAt">,
  indexDir?: string
): Promise<SavedRagIndex> {
  const resolvedIndexDir = resolveIndexDir(indexDir);
  const indexPath = createIndexPath(record.document.documentId, resolvedIndexDir);
  const persistedRecord: PersistedRagIndex = {
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    ...record,
  };

  await mkdir(resolvedIndexDir, { recursive: true });
  await writeFile(indexPath, `${JSON.stringify(persistedRecord, null, 2)}\n`, "utf-8");

  return {
    record: persistedRecord,
    indexPath,
    relativeIndexPath: relative(process.cwd(), indexPath),
  };
}

export async function loadRagIndex(
  documentId: string,
  indexDir?: string
): Promise<SavedRagIndex> {
  const resolvedIndexDir = resolveIndexDir(indexDir);
  const indexPath = createIndexPath(documentId, resolvedIndexDir);

  try {
    const raw = await readFile(indexPath, "utf-8");
    const record = JSON.parse(raw) as PersistedRagIndex;

    validatePersistedRagIndex(record, documentId);

    return {
      record,
      indexPath,
      relativeIndexPath: relative(process.cwd(), indexPath),
    };
  } catch (error) {
    if (error instanceof ApiRequestError) {
      throw error;
    }

    if (isNodeError(error) && error.code === "ENOENT") {
      throw new ApiRequestError(
        `No persisted RAG index found for documentId "${documentId}".`,
        404
      );
    }

    throw new ApiRequestError(`Failed to load persisted RAG index "${documentId}".`, 500);
  }
}

function createIndexPath(documentId: string, indexDir: string): string {
  return join(indexDir, `${hashDocumentId(documentId)}.json`);
}

function hashDocumentId(documentId: string): string {
  return createHash("sha256").update(documentId).digest("hex").slice(0, 32);
}

function validatePersistedRagIndex(record: PersistedRagIndex, documentId: string): void {
  if (!record || typeof record !== "object") {
    throw new ApiRequestError("Persisted RAG index is not a JSON object.", 500);
  }

  if (record.schemaVersion !== SCHEMA_VERSION) {
    throw new ApiRequestError(
      `Unsupported persisted RAG index schema version for "${documentId}".`,
      500
    );
  }

  if (!record.document || record.document.documentId !== documentId) {
    throw new ApiRequestError(`Persisted RAG index documentId mismatch for "${documentId}".`, 500);
  }

  if (!record.index || !Array.isArray(record.embeddedChunks)) {
    throw new ApiRequestError(`Persisted RAG index "${documentId}" is incomplete.`, 500);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
