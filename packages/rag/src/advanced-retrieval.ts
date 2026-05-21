import type { EmbeddedChunk, EmbeddingProvider } from "./embeddings";
import type { RetrievalResult } from "./retrieval";

export interface HyDETrace {
  enabled: boolean;
  hypotheticalDocument: string;
  embedding: {
    provider: string;
    dimensions: number;
  };
  retrievalDelta: {
    beforeTopScore: number;
    afterTopScore: number;
    improvement: number;
  };
}

export interface ClusterSummary {
  summary: string;
  chunkIds: string[];
  confidence: number;
}

export interface RaptorNode {
  id: string;
  level: number;
  label: string;
  summary: ClusterSummary;
  childIds: string[];
  parentId?: string;
}

export interface RaptorTree {
  rootId: string;
  maxDepth: number;
  nodes: RaptorNode[];
}

export interface RaptorTrace {
  enabled: boolean;
  hierarchyDepth: number;
  selectedNodes: Array<{
    nodeId: string;
    label: string;
    level: number;
    score: number;
    summary: string;
  }>;
  retrievalPath: Array<{
    parentNodeId: string;
    childNodeId: string;
    score: number;
  }>;
}

export interface RetrievalFusionTrace {
  weights: {
    semanticSimilarity: number;
    graphProximity: number;
    edgeConfidence: number;
    traversalDepth: number;
    hydeSimilarity: number;
    raptorSummary: number;
  };
  candidates: Array<{
    chunkId: string;
    semanticSimilarity: number;
    graphProximity: number;
    edgeConfidence: number;
    traversalDepth: number;
    hydeSimilarity: number;
    raptorSummary: number;
    finalScore: number;
  }>;
  selectedChunkIds: string[];
}

export interface RaptorRetrievalResult {
  trace: RaptorTrace;
  results: Array<{
    chunkId: string;
    score: number;
  }>;
}

export function buildHypotheticalDocument(
  query: string,
  options: {
    rewrittenQuery?: string;
    expansionTerms?: string[];
  } = {}
): string {
  const expansion = (options.expansionTerms ?? []).slice(0, 4).join(", ");
  return [
    `Hypothetical grounded answer for retrieval: ${query.trim()}.`,
    options.rewrittenQuery ? `Rewritten intent: ${options.rewrittenQuery}.` : undefined,
    expansion.length > 0 ? `Relevant related concepts: ${expansion}.` : undefined,
    "Prefer concrete implementation details, dependencies, and retrieval evidence.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildHyDETrace(
  provider: EmbeddingProvider,
  hypotheticalDocument: string,
  baselineResults: RetrievalResult[],
  hydeResults: RetrievalResult[]
): HyDETrace {
  const beforeTopScore = baselineResults[0]?.score ?? 0;
  const afterTopScore = hydeResults[0]?.score ?? 0;

  return {
    enabled: true,
    hypotheticalDocument,
    embedding: {
      provider: provider.name,
      dimensions: provider.dimensions,
    },
    retrievalDelta: {
      beforeTopScore: Number(beforeTopScore.toFixed(6)),
      afterTopScore: Number(afterTopScore.toFixed(6)),
      improvement: Number((afterTopScore - beforeTopScore).toFixed(6)),
    },
  };
}

export function buildRaptorTree(chunks: EmbeddedChunk[]): RaptorTree | undefined {
  if (chunks.length === 0) {
    return undefined;
  }

  const sectionGroups = new Map<string, EmbeddedChunk[]>();
  for (const chunk of chunks) {
    const key = `${chunk.documentId}:${chunk.sectionId}`;
    sectionGroups.set(key, [...(sectionGroups.get(key) ?? []), chunk]);
  }

  const sectionNodes: RaptorNode[] = [...sectionGroups.entries()].map(([key, sectionChunks], index) => ({
    id: `raptor:section:${index + 1}`,
    level: 1,
    label: key,
    summary: {
      summary: summarizeText(sectionChunks.map((chunk) => chunk.text).join(" ")),
      chunkIds: sectionChunks.map((chunk) => chunk.id),
      confidence: 0.72,
    },
    childIds: sectionChunks.map((chunk) => `raptor:chunk:${chunk.id}`),
    parentId: "raptor:root",
  }));

  const chunkNodes: RaptorNode[] = chunks.map((chunk) => ({
    id: `raptor:chunk:${chunk.id}`,
    level: 2,
    label: chunk.id,
    summary: {
      summary: summarizeText(chunk.text, 120),
      chunkIds: [chunk.id],
      confidence: 0.65,
    },
    childIds: [],
    parentId: sectionNodes.find((node) => node.childIds.includes(`raptor:chunk:${chunk.id}`))?.id,
  }));

  const rootNode: RaptorNode = {
    id: "raptor:root",
    level: 0,
    label: "document-root",
    summary: {
      summary: summarizeText(sectionNodes.map((node) => node.summary.summary).join(" ")),
      chunkIds: chunks.map((chunk) => chunk.id),
      confidence: 0.8,
    },
    childIds: sectionNodes.map((node) => node.id),
  };

  return {
    rootId: rootNode.id,
    maxDepth: 2,
    nodes: [rootNode, ...sectionNodes, ...chunkNodes],
  };
}

export function retrieveFromRaptorTree(
  tree: RaptorTree | undefined,
  query: string,
  topK = 3
): RaptorRetrievalResult | undefined {
  if (!tree) {
    return undefined;
  }

  const queryTerms = new Set(tokenize(query));
  const sectionNodes = tree.nodes.filter((node) => node.level === 1);
  const selectedNodes = sectionNodes
    .map((node) => {
      const score = lexicalOverlap(node.summary.summary, queryTerms);
      return {
        node,
        score,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);

  const path = selectedNodes.flatMap(({ node, score }) =>
    node.childIds.map((childNodeId) => ({
      parentNodeId: node.id,
      childNodeId,
      score: Number(score.toFixed(6)),
    }))
  );

  const results = selectedNodes.flatMap(({ node, score }) =>
    node.summary.chunkIds.map((chunkId) => ({
      chunkId,
      score: Number(score.toFixed(6)),
    }))
  );

  return {
    trace: {
      enabled: true,
      hierarchyDepth: tree.maxDepth,
      selectedNodes: selectedNodes.map(({ node, score }) => ({
        nodeId: node.id,
        label: node.label,
        level: node.level,
        score: Number(score.toFixed(6)),
        summary: node.summary.summary,
      })),
      retrievalPath: path,
    },
    results,
  };
}

function summarizeText(text: string, maxLength = 180): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function lexicalOverlap(text: string, queryTerms: Set<string>): number {
  const tokens = new Set(tokenize(text));
  const overlap = [...tokens].filter((token) => queryTerms.has(token)).length;

  if (overlap === 0) {
    return 0;
  }

  return overlap / Math.sqrt(Math.max(tokens.size, 1) * Math.max(queryTerms.size, 1));
}

function tokenize(text: string): string[] {
  return text.normalize("NFKC").toLowerCase().match(/[a-z0-9]+/g) ?? [];
}
