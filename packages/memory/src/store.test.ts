import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { FileSessionMemoryStore } from "./store";

describe("FileSessionMemoryStore", () => {
  it("appends and lists entries by session", async () => {
    const dir = await mkdtemp(join(tmpdir(), "groundedos-memory-test-"));

    try {
      const store = new FileSessionMemoryStore(dir);

      await store.append({
        sessionId: "s1",
        query: "What is RAG?",
        answer: "RAG means retrieval augmented generation.",
      });

      const list = await store.list("s1");
      expect(list).toHaveLength(1);
      expect(list[0]?.sessionId).toBe("s1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("searches relevant entries by lexical overlap", async () => {
    const dir = await mkdtemp(join(tmpdir(), "groundedos-memory-test-"));

    try {
      const store = new FileSessionMemoryStore(dir);

      await store.append({
        sessionId: "s2",
        query: "How to configure embeddings?",
        answer: "Use embedding provider settings.",
      });
      await store.append({
        sessionId: "s2",
        query: "What is quantization?",
        answer: "Model compression technique.",
      });

      const results = await store.search("s2", "configure embedding provider", 2);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]?.entry.query.toLowerCase()).toContain("configure");
      expect(results[0]?.score).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
