export type GraphEntityType =
  | "person"
  | "organization"
  | "technology"
  | "concept"
  | "file"
  | "api"
  | "module"
  | "dependency"
  | "event";

export interface GraphChunkRef {
  chunkId: string;
  documentId: string;
  sectionId: string;
  text: string;
}

export interface EntityNode {
  id: string;
  label: string;
  normalizedLabel: string;
  type: GraphEntityType;
  aliases: string[];
  confidence: number;
  chunkIds: string[];
  extractor: string;
}

export interface RelationEdge {
  id: string;
  from: string;
  to: string;
  type: "co_occurs_with" | "mentions" | "depends_on" | "references";
  confidence: number;
  chunkIds: string[];
}

export interface KnowledgeGraph {
  nodes: EntityNode[];
  edges: RelationEdge[];
  chunks: GraphChunkRef[];
}

export interface ExtractedEntity {
  label: string;
  type?: GraphEntityType;
  aliases?: string[];
  confidence?: number;
}

export interface EntityExtractionContext {
  chunk: GraphChunkRef;
}

export interface EntityExtractor {
  name: string;
  extract(context: EntityExtractionContext): ExtractedEntity[];
}

export interface EntityHit {
  entityId: string;
  label: string;
  type: GraphEntityType;
  score: number;
  chunkIds: string[];
}

export interface GraphRetrievalResult {
  chunkId: string;
  documentId: string;
  sectionId: string;
  text: string;
  score: number;
  matchedEntities: string[];
  depth: number;
  edgeConfidence: number;
  graphProximity: number;
}

export interface TraversalStep {
  fromEntityId: string;
  fromLabel: string;
  toEntityId: string;
  toLabel: string;
  relationType: RelationEdge["type"];
  depth: number;
  confidence: number;
  chunkIds: string[];
}

export interface GraphTraversalStrategy {
  traverse(
    graph: KnowledgeGraph,
    startingEntityIds: string[],
    maxDepth: number
  ): TraversalStep[];
}

export interface GraphStore {
  setGraph(graph: KnowledgeGraph): void;
  getGraph(): KnowledgeGraph;
  searchEntities(query: string, limit?: number): EntityHit[];
}

export interface GraphRetrieverOptions {
  topK?: number;
  maxDepth?: number;
}

export interface GraphRetrieverResult {
  entityHits: EntityHit[];
  traversalSteps: TraversalStep[];
  results: GraphRetrievalResult[];
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "does",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "what",
  "when",
  "where",
  "which",
  "with",
]);

const PRIORITY_TERMS = new Set([
  "api",
  "cache",
  "chunk",
  "context",
  "embedding",
  "eval",
  "graph",
  "hybrid",
  "index",
  "memory",
  "module",
  "provider",
  "query",
  "rag",
  "ranking",
  "retrieval",
  "semantic",
  "vector",
]);

export function createRegexEntityExtractor(): EntityExtractor {
  return {
    name: "regex",
    extract({ chunk }) {
      const tokens = tokenize(chunk.text);
      const seen = new Set<string>();
      const extracted: ExtractedEntity[] = [];

      for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index]!;
        if (isIgnoredToken(token)) {
          continue;
        }

        if (token.length >= 6 || PRIORITY_TERMS.has(token)) {
          pushEntity(extracted, seen, {
            label: token,
            type: inferEntityType(token),
            confidence: PRIORITY_TERMS.has(token) ? 0.7 : 0.55,
          });
        }

        const next = tokens[index + 1];
        if (next && !isIgnoredToken(next)) {
          pushEntity(extracted, seen, {
            label: `${token} ${next}`,
            type: inferEntityType(`${token} ${next}`),
            confidence: 0.8,
          });
        }
      }

      return extracted.slice(0, 12);
    },
  };
}

export class InMemoryGraphStore implements GraphStore {
  #graph: KnowledgeGraph = { nodes: [], edges: [], chunks: [] };

  setGraph(graph: KnowledgeGraph): void {
    this.#graph = graph;
  }

  getGraph(): KnowledgeGraph {
    return this.#graph;
  }

  searchEntities(query: string, limit = 5): EntityHit[] {
    const queryTokens = new Set(tokenize(query));

    if (queryTokens.size === 0) {
      return [];
    }

    return this.#graph.nodes
      .map((node) => {
        const nodeTokens = new Set(tokenize(node.label));
        const overlap = [...nodeTokens].filter((token) => queryTokens.has(token)).length;
        const score = overlap === 0 ? 0 : overlap / Math.sqrt(nodeTokens.size * queryTokens.size);

        return {
          entityId: node.id,
          label: node.label,
          type: node.type,
          score: Number(score.toFixed(6)),
          chunkIds: node.chunkIds,
        } satisfies EntityHit;
      })
      .filter((hit) => hit.score > 0)
      .sort((left, right) => {
        if (right.score === left.score) {
          return left.label.localeCompare(right.label);
        }

        return right.score - left.score;
      })
      .slice(0, limit);
  }
}

export class BreadthFirstTraversalStrategy implements GraphTraversalStrategy {
  traverse(graph: KnowledgeGraph, startingEntityIds: string[], maxDepth: number): TraversalStep[] {
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const adjacency = new Map<string, RelationEdge[]>();

    for (const edge of graph.edges) {
      adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge]);
      adjacency.set(edge.to, [...(adjacency.get(edge.to) ?? []), edge]);
    }

    const queue = startingEntityIds.map((entityId) => ({ entityId, depth: 0 }));
    const visited = new Set<string>(startingEntityIds);
    const steps: TraversalStep[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) {
        continue;
      }

      const edges = (adjacency.get(current.entityId) ?? [])
        .slice()
        .sort((left, right) => right.confidence - left.confidence);

      for (const edge of edges) {
        const targetId = edge.from === current.entityId ? edge.to : edge.from;
        const fromNode = nodesById.get(current.entityId);
        const toNode = nodesById.get(targetId);

        if (!fromNode || !toNode) {
          continue;
        }

        steps.push({
          fromEntityId: fromNode.id,
          fromLabel: fromNode.label,
          toEntityId: toNode.id,
          toLabel: toNode.label,
          relationType: edge.type,
          depth: current.depth + 1,
          confidence: edge.confidence,
          chunkIds: edge.chunkIds,
        });

        if (!visited.has(targetId)) {
          visited.add(targetId);
          queue.push({ entityId: targetId, depth: current.depth + 1 });
        }
      }
    }

    return steps;
  }
}

export function buildKnowledgeGraph(
  chunks: GraphChunkRef[],
  options: { extractors?: EntityExtractor[] } = {}
): KnowledgeGraph {
  const extractors = options.extractors ?? [createRegexEntityExtractor()];
  const nodesByLabel = new Map<string, EntityNode>();
  const edgesByKey = new Map<string, RelationEdge>();

  for (const chunk of chunks) {
    const chunkEntities = extractors
      .flatMap((extractor) =>
        extractor.extract({ chunk }).map((entity) => ({
          ...entity,
          extractor: extractor.name,
        }))
      )
      .filter((entity) => entity.label.trim().length > 0);

    const entityIds: string[] = [];

    for (const entity of chunkEntities) {
      const normalizedLabel = normalizeLabel(entity.label);
      const existing = nodesByLabel.get(normalizedLabel);

      if (existing) {
        if (!existing.chunkIds.includes(chunk.chunkId)) {
          existing.chunkIds.push(chunk.chunkId);
        }
        existing.confidence = Number(
          Math.max(existing.confidence, entity.confidence ?? existing.confidence).toFixed(6)
        );
        for (const alias of entity.aliases ?? []) {
          if (!existing.aliases.includes(alias)) {
            existing.aliases.push(alias);
          }
        }
        entityIds.push(existing.id);
        continue;
      }

      const node: EntityNode = {
        id: `entity:${normalizedLabel}`,
        label: entity.label.trim(),
        normalizedLabel,
        type: entity.type ?? inferEntityType(entity.label),
        aliases: [...(entity.aliases ?? [])],
        confidence: Number((entity.confidence ?? 0.6).toFixed(6)),
        chunkIds: [chunk.chunkId],
        extractor: entity.extractor,
      };

      nodesByLabel.set(normalizedLabel, node);
      entityIds.push(node.id);
    }

    for (let index = 0; index < entityIds.length; index += 1) {
      for (let inner = index + 1; inner < entityIds.length; inner += 1) {
        const left = entityIds[index]!;
        const right = entityIds[inner]!;
        const key = [left, right].sort().join("::");
        const existing = edgesByKey.get(key);

        if (existing) {
          if (!existing.chunkIds.includes(chunk.chunkId)) {
            existing.chunkIds.push(chunk.chunkId);
          }
          existing.confidence = Number(Math.min(1, existing.confidence + 0.08).toFixed(6));
          continue;
        }

        edgesByKey.set(key, {
          id: `edge:${key}`,
          from: left,
          to: right,
          type: inferRelationType(left, right),
          confidence: 0.52,
          chunkIds: [chunk.chunkId],
        });
      }
    }
  }

  return {
    nodes: [...nodesByLabel.values()].sort((left, right) => left.label.localeCompare(right.label)),
    edges: [...edgesByKey.values()].sort((left, right) => left.id.localeCompare(right.id)),
    chunks,
  };
}

export function retrieveFromKnowledgeGraph(
  store: GraphStore,
  query: string,
  options: GraphRetrieverOptions = {}
): GraphRetrieverResult {
  const graph = store.getGraph();
  const entityHits = store.searchEntities(query, 5);
  const traversal = new BreadthFirstTraversalStrategy().traverse(
    graph,
    entityHits.map((hit) => hit.entityId),
    options.maxDepth ?? 2
  );
  const chunksById = new Map(graph.chunks.map((chunk) => [chunk.chunkId, chunk]));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const scoredChunks = new Map<
    string,
    {
      chunk: GraphChunkRef;
      score: number;
      matchedEntities: Set<string>;
      depth: number;
      edgeConfidence: number;
      graphProximity: number;
    }
  >();

  for (const hit of entityHits) {
    for (const chunkId of hit.chunkIds) {
      const chunk = chunksById.get(chunkId);
      if (!chunk) {
        continue;
      }

      const existing = scoredChunks.get(chunkId) ?? {
        chunk,
        score: 0,
        matchedEntities: new Set<string>(),
        depth: 0,
        edgeConfidence: 0,
        graphProximity: 1,
      };
      existing.score += hit.score * 0.8;
      existing.matchedEntities.add(hit.label);
      scoredChunks.set(chunkId, existing);
    }
  }

  for (const step of traversal) {
    const toNode = nodeById.get(step.toEntityId);
    if (!toNode) {
      continue;
    }

    for (const chunkId of toNode.chunkIds) {
      const chunk = chunksById.get(chunkId);
      if (!chunk) {
        continue;
      }

      const proximity = Number((1 / (step.depth + 1)).toFixed(6));
      const existing = scoredChunks.get(chunkId) ?? {
        chunk,
        score: 0,
        matchedEntities: new Set<string>(),
        depth: step.depth,
        edgeConfidence: step.confidence,
        graphProximity: proximity,
      };
      existing.score += proximity * step.confidence;
      existing.matchedEntities.add(step.toLabel);
      existing.depth = Math.min(existing.depth, step.depth);
      existing.edgeConfidence = Math.max(existing.edgeConfidence, step.confidence);
      existing.graphProximity = Math.max(existing.graphProximity, proximity);
      scoredChunks.set(chunkId, existing);
    }
  }

  const results = [...scoredChunks.values()]
    .map((entry) => ({
      chunkId: entry.chunk.chunkId,
      documentId: entry.chunk.documentId,
      sectionId: entry.chunk.sectionId,
      text: entry.chunk.text,
      score: Number(entry.score.toFixed(6)),
      matchedEntities: [...entry.matchedEntities].sort(),
      depth: entry.depth,
      edgeConfidence: Number(entry.edgeConfidence.toFixed(6)),
      graphProximity: Number(entry.graphProximity.toFixed(6)),
    }))
    .sort((left, right) => {
      if (right.score === left.score) {
        return left.chunkId.localeCompare(right.chunkId);
      }

      return right.score - left.score;
    })
    .slice(0, options.topK ?? 5);

  return {
    entityHits,
    traversalSteps: traversal,
    results,
  };
}

function pushEntity(target: ExtractedEntity[], seen: Set<string>, entity: ExtractedEntity): void {
  const normalized = normalizeLabel(entity.label);
  if (normalized.length === 0 || seen.has(normalized)) {
    return;
  }

  seen.add(normalized);
  target.push(entity);
}

function isIgnoredToken(token: string): boolean {
  return STOP_WORDS.has(token) || token.length <= 2;
}

function tokenize(text: string): string[] {
  return text.normalize("NFKC").toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function normalizeLabel(text: string): string {
  return tokenize(text).join(" ").trim();
}

function inferEntityType(label: string): GraphEntityType {
  const normalized = normalizeLabel(label);

  if (normalized.includes("api")) {
    return "api";
  }
  if (normalized.includes("module")) {
    return "module";
  }
  if (normalized.includes("dependency")) {
    return "dependency";
  }
  if (normalized.includes("file")) {
    return "file";
  }
  if (normalized.includes("event")) {
    return "event";
  }
  if (normalized.includes("cache") || normalized.includes("retrieval")) {
    return "concept";
  }

  return "technology";
}

function inferRelationType(leftId: string, rightId: string): RelationEdge["type"] {
  if (leftId.includes("dependency") || rightId.includes("dependency")) {
    return "depends_on";
  }
  if (leftId.includes("api") || rightId.includes("api")) {
    return "references";
  }

  return "co_occurs_with";
}
