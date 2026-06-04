import { describe, expect, it } from "vitest";

import {
  InMemoryGraphStore,
  buildKnowledgeGraph,
  defaultPathBasedRetriever,
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

  it("extracts ADR and endpoint entities with traced relations", () => {
    const chunks: GraphChunkRef[] = [
      {
        chunkId: "chunk-adr",
        documentId: "doc-adr",
        sectionId: "section-1",
        text: "ADR-014 introduces JWT auth strategy and is documented in ADR-014. POST /graph/build uses auth.service.ts.",
      },
    ];

    const graph = buildKnowledgeGraph(chunks);

    expect(
      graph.nodes.some(
        (node) => node.type === "ADR" && node.label.toLowerCase() === "adr-014"
      )
    ).toBe(true);
    expect(graph.nodes.some((node) => node.type === "API_endpoint")).toBe(true);
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.extractionTrace?.relationCandidates.length).toBeGreaterThan(0);
    expect(graph.triples.length).toBe(graph.edges.length);
  });

  it("supports graph repository operations for paths and subgraphs", () => {
    const chunks: GraphChunkRef[] = [
      {
        chunkId: "chunk-1",
        documentId: "doc-1",
        sectionId: "section-1",
        text: "Semantic cache depends on retrieval.",
      },
      {
        chunkId: "chunk-2",
        documentId: "doc-1",
        sectionId: "section-2",
        text: "Retrieval affects API Keys.",
      },
    ];
    const store = new InMemoryGraphStore();
    const graph = buildKnowledgeGraph(chunks);
    store.setGraph(graph);

    const authNode = store.findNodes("semantic cache")[0];
    const apiKeysNode = store.findNodes("retrieval")[0];
    expect(authNode).toBeDefined();
    expect(apiKeysNode).toBeDefined();

    const paths = defaultPathBasedRetriever.retrievePaths(
      store,
      authNode!.label,
      apiKeysNode!.label,
      3
    );
    expect(paths.length).toBeGreaterThan(0);

    const subgraph = store.getSubgraph([authNode!.id], 2);
    expect(subgraph.nodes.length).toBeGreaterThan(0);
    expect(subgraph.edges.length).toBeGreaterThan(0);
  });
});
