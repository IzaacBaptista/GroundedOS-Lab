import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApiRequestError } from "./errors";
import {
  deleteRagIndex,
  listRagIndexes,
  loadRagIndex,
  resolveIndexDir,
  saveRagIndex,
  type PersistedRagIndex,
} from "./rag-index-store";

const SCHEMA_VERSION = 1;

function makeRecord(
  documentId = "doc-store-test",
  overrides: Partial<PersistedRagIndex> = {}
): Omit<PersistedRagIndex, "schemaVersion" | "createdAt"> {
  return {
    document: {
      documentId,
      title: "Store Test Document",
      modality: "text",
      checksum: "abc123",
    },
    index: {
      chunkCount: 1,
      embeddingProvider: "api-lexical",
      embeddingDimensions: 64,
    },
    embeddedChunks: [],
    ...overrides,
  };
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "groundedos-index-store-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("resolveIndexDir", () => {
  it("returns the explicit argument when provided", () => {
    expect(resolveIndexDir("/custom/path")).toBe("/custom/path");
  });

  it("falls back to the GROUNDEDOS_INDEX_DIR env variable", () => {
    const original = process.env.GROUNDEDOS_INDEX_DIR;

    process.env.GROUNDEDOS_INDEX_DIR = "/env/path";

    try {
      expect(resolveIndexDir(undefined)).toBe("/env/path");
    } finally {
      if (original === undefined) {
        delete process.env.GROUNDEDOS_INDEX_DIR;
      } else {
        process.env.GROUNDEDOS_INDEX_DIR = original;
      }
    }
  });

  it("falls back to the default .groundedos/indexes when no argument or env var is set", () => {
    const original = process.env.GROUNDEDOS_INDEX_DIR;

    delete process.env.GROUNDEDOS_INDEX_DIR;

    try {
      expect(resolveIndexDir(undefined)).toBe(".groundedos/indexes");
    } finally {
      if (original !== undefined) {
        process.env.GROUNDEDOS_INDEX_DIR = original;
      }
    }
  });
});

describe("saveRagIndex and loadRagIndex", () => {
  it("persists a record to disk and loads it back", async () => {
    const record = makeRecord("doc-roundtrip");
    const saved = await saveRagIndex(record, tempDir);

    expect(saved.record.schemaVersion).toBe(SCHEMA_VERSION);
    expect(saved.record.document.documentId).toBe("doc-roundtrip");
    expect(saved.indexPath).toContain(tempDir);
    expect(saved.relativeIndexPath).not.toMatch(/^\//);
    expect(saved.relativeIndexPath).toMatch(/[a-f0-9]+\.json$/);

    const loaded = await loadRagIndex("doc-roundtrip", tempDir);

    expect(loaded.record.document.documentId).toBe("doc-roundtrip");
    expect(loaded.record.index.chunkCount).toBe(1);
    expect(loaded.indexPath).toBe(saved.indexPath);
  });

  it("throws a 404 ApiRequestError when the index file does not exist", async () => {
    await expect(loadRagIndex("missing-doc", tempDir)).rejects.toMatchObject({
      statusCode: 404,
      message: 'No persisted RAG index found for documentId "missing-doc".',
    });
    await expect(loadRagIndex("missing-doc", tempDir)).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("throws a 500 ApiRequestError when the file contains invalid JSON", async () => {
    const saved = await saveRagIndex(makeRecord("doc-bad-json"), tempDir);

    await writeFile(saved.indexPath, "{ invalid json }", "utf-8");

    await expect(loadRagIndex("doc-bad-json", tempDir)).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  it("throws a 500 ApiRequestError when the schema version does not match", async () => {
    const saved = await saveRagIndex(makeRecord("doc-schema-ver"), tempDir);
    const raw = JSON.parse(
      await (await import("fs/promises")).readFile(saved.indexPath, "utf-8")
    ) as Record<string, unknown>;

    raw.schemaVersion = 999;
    await writeFile(saved.indexPath, `${JSON.stringify(raw, null, 2)}\n`, "utf-8");

    await expect(loadRagIndex("doc-schema-ver", tempDir)).rejects.toMatchObject({
      statusCode: 500,
      message: expect.stringContaining("schema version"),
    });
  });

  it("throws a 500 ApiRequestError when the stored documentId does not match", async () => {
    const saved = await saveRagIndex(makeRecord("doc-mismatch"), tempDir);
    const raw = JSON.parse(
      await (await import("fs/promises")).readFile(saved.indexPath, "utf-8")
    ) as { document: { documentId: string } };

    raw.document.documentId = "other-doc";
    await writeFile(saved.indexPath, `${JSON.stringify(raw, null, 2)}\n`, "utf-8");

    await expect(loadRagIndex("doc-mismatch", tempDir)).rejects.toMatchObject({
      statusCode: 500,
      message: expect.stringContaining("documentId mismatch"),
    });
  });

  it("throws a 500 ApiRequestError when the record is missing required fields", async () => {
    const saved = await saveRagIndex(makeRecord("doc-incomplete"), tempDir);
    const raw = JSON.parse(
      await (await import("fs/promises")).readFile(saved.indexPath, "utf-8")
    ) as Record<string, unknown>;

    delete raw.embeddedChunks;
    await writeFile(saved.indexPath, `${JSON.stringify(raw, null, 2)}\n`, "utf-8");

    await expect(loadRagIndex("doc-incomplete", tempDir)).rejects.toMatchObject({
      statusCode: 500,
      message: expect.stringContaining("incomplete"),
    });
  });
});

describe("listRagIndexes", () => {
  it("returns an empty array when the index directory does not exist", async () => {
    const result = await listRagIndexes(join(tempDir, "nonexistent-subdir"));

    expect(result).toEqual([]);
  });

  it("returns all saved index entries sorted by createdAt descending", async () => {
    await saveRagIndex(makeRecord("doc-list-alpha"), tempDir);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await saveRagIndex(makeRecord("doc-list-beta"), tempDir);

    const list = await listRagIndexes(tempDir);

    expect(list).toHaveLength(2);
    expect(list[0]?.document.documentId).toBe("doc-list-beta");
    expect(list[1]?.document.documentId).toBe("doc-list-alpha");
    expect(list[0]?.storage.persisted).toBe(true);
  });

  it("ignores non-JSON files in the index directory", async () => {
    await saveRagIndex(makeRecord("doc-list-only"), tempDir);
    await writeFile(join(tempDir, "README.txt"), "not an index", "utf-8");

    const list = await listRagIndexes(tempDir);

    expect(list).toHaveLength(1);
    expect(list[0]?.document.documentId).toBe("doc-list-only");
  });
});

describe("deleteRagIndex", () => {
  it("removes the index file and returns its list-item metadata", async () => {
    await saveRagIndex(makeRecord("doc-delete-me"), tempDir);

    const deleted = await deleteRagIndex("doc-delete-me", tempDir);

    expect(deleted.document.documentId).toBe("doc-delete-me");
    expect(deleted.storage.persisted).toBe(true);

    await expect(loadRagIndex("doc-delete-me", tempDir)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("throws a 404 ApiRequestError when the index to delete does not exist", async () => {
    await expect(deleteRagIndex("no-such-doc", tempDir)).rejects.toMatchObject({
      statusCode: 404,
      message: 'No persisted RAG index found for documentId "no-such-doc".',
    });
  });
});
