import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { FileMemoryManager } from "./manager";
import { FileSessionMemoryStore } from "./store";

describe("FileMemoryManager", () => {
  it("builds a hierarchical memory snapshot with episodes and facts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "groundedos-memory-manager-"));

    try {
      const store = new FileSessionMemoryStore(dir);
      const manager = new FileMemoryManager(store);

      await store.append({
        sessionId: "hierarchy-session",
        query: "Implement working memory limits",
        answer: "The system keeps recent messages in working memory and stores overflow in episodic memory.",
        metadata: { tools: ["planner"] },
      });
      await store.append({
        sessionId: "hierarchy-session",
        query: "How do we consolidate memory?",
        answer: "The architecture supports consolidation and extracts semantic facts for long-term memory.",
        metadata: { tools: ["summarizer"] },
      });
      await store.append({
        sessionId: "hierarchy-session",
        query: "What does retrieval use?",
        answer: "Memory retrieval uses episodic summaries and persistent facts to answer later queries.",
      });

      const hierarchy = await manager.getHierarchy("hierarchy-session", {
        query: "memory retrieval",
        maxWorkingMemoryTokens: 24,
      });

      expect(hierarchy.workingMemory.items.length).toBeGreaterThan(0);
      expect(hierarchy.workingMemory.compressionTriggered).toBe(true);
      expect(hierarchy.episodicMemory.episodes.length).toBeGreaterThan(0);
      expect(hierarchy.longTermMemory.facts.length).toBeGreaterThan(0);
      expect(hierarchy.traces.some((trace) => trace.stage === "fact-extraction")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("retrieves working, episodic, and factual memory results", async () => {
    const dir = await mkdtemp(join(tmpdir(), "groundedos-memory-manager-"));

    try {
      const store = new FileSessionMemoryStore(dir);
      const manager = new FileMemoryManager(store);

      await store.append({
        sessionId: "retrieval-session",
        query: "What is episodic memory?",
        answer: "Episodic memory stores task sequences and outcomes for later recall.",
      });
      await store.append({
        sessionId: "retrieval-session",
        query: "How are facts extracted?",
        answer: "Fact extraction keeps durable statements and provenance for long-term memory.",
      });

      const retrieval = await manager.retrieve("retrieval-session", "long-term memory facts", {
        retrievalStrategy: "hybrid",
        limit: 5,
      });

      expect(retrieval.results.length).toBeGreaterThan(0);
      expect(retrieval.selectionTrace.length).toBe(retrieval.results.length);
      expect(retrieval.results.some((item) => item.memoryType === "fact")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
