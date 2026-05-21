import { describe, expect, it } from "vitest";

import {
  InMemoryGraphStore,
  buildKnowledgeGraph,
  retrieveFromKnowledgeGraph,
  type GraphChunkRef,
} from "./index";

describe("graphrag", () => {
  it("builds a lightweight knowledge graph and retrieves related chunks", () => {
    const chunks: GraphChunkRef[] = [
      {
        chunkId: "chunk-1",
        documentId: "doc-1",
        sectionId: "section-1",
        text: "Semantic cache depends on retrieval quality and cache invalidation policy.",
      },
      {
        chunkId: "chunk-2",
        documentId: "doc-1",
        sectionId: "section-2",
        text: "Hybrid retrieval combines dense retrieval with sparse search and reranking.",
      },
    ];

    const store = new InMemoryGraphStore();
    store.setGraph(buildKnowledgeGraph(chunks));

    const result = retrieveFromKnowledgeGraph(
      store,
      "How does semantic cache depend on retrieval?",
      { topK: 2, maxDepth: 2 }
    );

    expect(result.entityHits.map((hit) => hit.label)).toContain("semantic cache");
    expect(result.traversalSteps.length).toBeGreaterThan(0);
    expect(result.results[0]).toMatchObject({
      chunkId: "chunk-1",
      matchedEntities: expect.arrayContaining(["semantic cache", "retrieval"]),
    });
  });
});
