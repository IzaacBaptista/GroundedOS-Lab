import { createHash } from "crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "fs/promises";
import { join, relative } from "path";
import type { EmbeddedChunk } from "@groundedos/rag";

import { ApiRequestError } from "./errors";
import type { RagDocumentSummary, RagIndexSummary } from "./rag-service";

const SCHEMA_VERSION = 1;
const DEFAULT_INDEX_DIR = ".groundedos/indexes";

export type PersistedRagIndex = {
  schemaVersion: typeof SCHEMA_VERSION;
  createdAt: string;
  ownership: {
    tenantId: string;
    userId: string;
    createdBy: string;
  };
  /**
   * @deprecated Backward compatibility alias. Use ownership.userId.
   */
  resourceOwner?: string;
  document: RagDocumentSummary;
  index: RagIndexSummary;
  embeddedChunks: EmbeddedChunk[];
};

export type SavedRagIndex = {
  record: PersistedRagIndex;
  indexPath: string;
  relativeIndexPath: string;
};

export type RagIndexVersionSummary = {
  versionId: string;
  createdAt: string;
  checksum: string;
};

export type PersistedRagIndexListItem = {
  createdAt: string;
  ownership: {
    tenantId: string;
    userId: string;
    createdBy: string;
  };
  resourceOwner?: string;
  document: RagDocumentSummary;
  index: RagIndexSummary;
  storage: {
    persisted: true;
    indexPath: string;
  };
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
  await archiveCurrentVersionIfPresent(record.document.documentId, resolvedIndexDir);
  await writeFile(indexPath, `${JSON.stringify(persistedRecord, null, 2)}\n`, "utf-8");

  return {
    record: persistedRecord,
    indexPath,
    relativeIndexPath: relative(process.cwd(), indexPath),
  };
}

/**
 * Book cap. 10 (versionamento): before a document's persisted index is
 * overwritten, archive the previous version so it can be listed/rolled back
 * instead of being destroyed on every update/reindex.
 */
async function archiveCurrentVersionIfPresent(
  documentId: string,
  resolvedIndexDir: string
): Promise<void> {
  const currentPath = createIndexPath(documentId, resolvedIndexDir);
  let raw: string;

  try {
    raw = await readFile(currentPath, "utf-8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  const previousRecord = JSON.parse(raw) as PersistedRagIndex;
  const versionsDir = versionsDirFor(documentId, resolvedIndexDir);
  await mkdir(versionsDir, { recursive: true });
  await writeFile(join(versionsDir, `${versionIdFor(previousRecord)}.json`), raw, "utf-8");
}

function versionsDirFor(documentId: string, indexDir: string): string {
  return join(indexDir, ".versions", hashDocumentId(documentId));
}

function versionIdFor(record: PersistedRagIndex): string {
  return record.createdAt.replace(/[:.]/g, "-");
}

/**
 * Book cap. 10 (stale documents / incremental indexing): a document is
 * stale when no index is persisted for it yet, or when the freshly computed
 * content checksum no longer matches what was last indexed.
 */
export async function isDocumentStale(
  documentId: string,
  checksum: string,
  indexDir?: string,
  ownership?: {
    tenantId: string;
    userId: string;
  }
): Promise<boolean> {
  const saved = await tryLoadRagIndex(documentId, indexDir, ownership);
  return saved === undefined || saved.record.document.checksum !== checksum;
}

/**
 * Book cap. 10 (versionamento): list archived versions for a document,
 * newest first. Ownership is enforced against the *current* persisted
 * index, since archived versions don't carry their own ownership check
 * separately from the document they belong to.
 */
export async function listRagIndexVersions(
  documentId: string,
  indexDir?: string,
  ownership?: {
    tenantId: string;
    userId: string;
  }
): Promise<RagIndexVersionSummary[]> {
  await loadRagIndex(documentId, indexDir, ownership);

  const resolvedIndexDir = resolveIndexDir(indexDir);
  const versionsDir = versionsDirFor(documentId, resolvedIndexDir);

  try {
    const entries = await readdir(versionsDir, { withFileTypes: true });
    const versionFiles = entries.filter(
      (entry) => entry.isFile() && entry.name.endsWith(".json")
    );

    const summaries = await Promise.all(
      versionFiles.map(async (entry) => {
        const raw = await readFile(join(versionsDir, entry.name), "utf-8");
        const record = JSON.parse(raw) as PersistedRagIndex;
        return {
          versionId: entry.name.replace(/\.json$/, ""),
          createdAt: record.createdAt,
          checksum: record.document.checksum,
        };
      })
    );

    return summaries.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

/**
 * Book cap. 10 (versionamento / reindexação): restore an archived version as
 * the current persisted index. The version being replaced is archived first
 * (via `saveRagIndex`'s own archiving step), so a rollback is itself
 * reversible rather than destructive.
 */
export async function rollbackRagIndex(
  documentId: string,
  versionId: string,
  indexDir?: string,
  ownership?: {
    tenantId: string;
    userId: string;
  }
): Promise<SavedRagIndex> {
  await loadRagIndex(documentId, indexDir, ownership);

  const resolvedIndexDir = resolveIndexDir(indexDir);
  const versionPath = join(versionsDirFor(documentId, resolvedIndexDir), `${versionId}.json`);

  let raw: string;
  try {
    raw = await readFile(versionPath, "utf-8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new ApiRequestError(
        `No version "${versionId}" found for documentId "${documentId}".`,
        404
      );
    }

    throw error;
  }

  const archivedRecord = JSON.parse(raw) as PersistedRagIndex;
  validatePersistedRagIndex(archivedRecord, documentId);

  return saveRagIndex(
    {
      ownership: archivedRecord.ownership,
      resourceOwner: archivedRecord.resourceOwner,
      document: archivedRecord.document,
      index: archivedRecord.index,
      embeddedChunks: archivedRecord.embeddedChunks,
    },
    indexDir
  );
}

export async function loadRagIndex(
  documentId: string,
  indexDir?: string,
  ownership?: {
    tenantId: string;
    userId: string;
  }
): Promise<SavedRagIndex> {
  const resolvedIndexDir = resolveIndexDir(indexDir);
  const indexPath = createIndexPath(documentId, resolvedIndexDir);

  try {
    const raw = await readFile(indexPath, "utf-8");
    const record = JSON.parse(raw) as PersistedRagIndex;

    validatePersistedRagIndex(record, documentId);
    validateResourceOwnership(record, ownership, documentId);

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

/**
 * Like `loadRagIndex`, but resolves to `undefined` instead of throwing when
 * no persisted index exists yet — useful for update/reindex call sites that
 * need to know "was there a previous version?" without a try/catch.
 */
export async function tryLoadRagIndex(
  documentId: string,
  indexDir?: string,
  ownership?: {
    tenantId: string;
    userId: string;
  }
): Promise<SavedRagIndex | undefined> {
  try {
    return await loadRagIndex(documentId, indexDir, ownership);
  } catch (error) {
    if (error instanceof ApiRequestError && error.statusCode === 404) {
      return undefined;
    }

    throw error;
  }
}

export async function listRagIndexes(
  indexDir?: string,
  ownership?: {
    tenantId: string;
    userId: string;
  }
): Promise<PersistedRagIndexListItem[]> {
  const resolvedIndexDir = resolveIndexDir(indexDir);

  try {
    const entries = await readdir(resolvedIndexDir, {
      withFileTypes: true,
    });
    const indexFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => join(resolvedIndexDir, entry.name));
    const items = await Promise.all(indexFiles.map(readIndexListItem));

    const scopedItems =
      ownership === undefined
        ? items
        : items.filter(
            (item) =>
              item.ownership.tenantId === ownership.tenantId &&
              item.ownership.userId === ownership.userId
          );

    return scopedItems.sort((left, right) => {
      const createdAtOrder = right.createdAt.localeCompare(left.createdAt);

      if (createdAtOrder !== 0) {
        return createdAtOrder;
      }

      return left.document.documentId.localeCompare(right.document.documentId);
    });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    if (error instanceof ApiRequestError) {
      throw error;
    }

    throw new ApiRequestError("Failed to list persisted RAG indexes.", 500);
  }
}

export async function deleteRagIndex(
  documentId: string,
  indexDir?: string,
  ownership?: {
    tenantId: string;
    userId: string;
  }
): Promise<PersistedRagIndexListItem> {
  const saved = await loadRagIndex(documentId, indexDir, ownership);

  try {
    await unlink(saved.indexPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new ApiRequestError(
        `No persisted RAG index found for documentId "${documentId}".`,
        404
      );
    }

    throw new ApiRequestError(`Failed to delete persisted RAG index "${documentId}".`, 500);
  }

  return toListItem(saved.record, saved.relativeIndexPath);
}

async function readIndexListItem(indexPath: string): Promise<PersistedRagIndexListItem> {
  const raw = await readFile(indexPath, "utf-8");
  const record = JSON.parse(raw) as PersistedRagIndex;

  validatePersistedRagIndex(record, record.document?.documentId ?? "unknown");

  return toListItem(record, relative(process.cwd(), indexPath));
}

function createIndexPath(documentId: string, indexDir: string): string {
  return join(indexDir, `${hashDocumentId(documentId)}.json`);
}

function hashDocumentId(documentId: string): string {
  return createHash("sha256").update(documentId).digest("hex").slice(0, 32);
}

function toListItem(record: PersistedRagIndex, indexPath: string): PersistedRagIndexListItem {
  const normalizedOwnership = normalizeOwnership(record);
  return {
    createdAt: record.createdAt,
    ownership: normalizedOwnership,
    resourceOwner: normalizedOwnership.userId,
    document: record.document,
    index: record.index,
    storage: {
      persisted: true,
      indexPath,
    },
  };
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

  normalizeOwnership(record);
}

function validateResourceOwnership(
  record: PersistedRagIndex,
  ownership:
    | {
        tenantId: string;
        userId: string;
      }
    | undefined,
  documentId: string
): void {
  if (!ownership) {
    return;
  }

  const normalizedOwnership = normalizeOwnership(record);
  if (
    normalizedOwnership.tenantId !== ownership.tenantId ||
    normalizedOwnership.userId !== ownership.userId
  ) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "access.cross_tenant_attempt",
        resourceType: "rag_index",
        documentId,
        expectedTenantId: ownership.tenantId,
        expectedUserId: ownership.userId,
        actualTenantId: normalizedOwnership.tenantId,
        actualUserId: normalizedOwnership.userId,
      })
    );
    throw new ApiRequestError(
      `No persisted RAG index found for documentId "${documentId}".`,
      404
    );
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function normalizeOwnership(record: PersistedRagIndex): {
  tenantId: string;
  userId: string;
  createdBy: string;
} {
  if (
    record.ownership &&
    typeof record.ownership.tenantId === "string" &&
    record.ownership.tenantId.trim().length > 0 &&
    typeof record.ownership.userId === "string" &&
    record.ownership.userId.trim().length > 0 &&
    typeof record.ownership.createdBy === "string" &&
    record.ownership.createdBy.trim().length > 0
  ) {
    return {
      tenantId: record.ownership.tenantId,
      userId: record.ownership.userId,
      createdBy: record.ownership.createdBy,
    };
  }

  if (typeof record.resourceOwner === "string" && record.resourceOwner.trim().length > 0) {
    return {
      tenantId: record.resourceOwner,
      userId: record.resourceOwner,
      createdBy: record.resourceOwner,
    };
  }

  console.warn(
    JSON.stringify({
      level: "warn",
      event: "access.ownership_validation_failed",
      resourceType: "rag_index",
      documentId: record.document?.documentId,
    })
  );
  throw new ApiRequestError("Persisted RAG index ownership metadata is missing.", 500);
}
