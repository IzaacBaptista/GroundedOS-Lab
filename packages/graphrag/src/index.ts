export type GraphEntityType =
  | "concept"
  | "technology"
  | "architecture_component"
  | "module"
  | "package"
  | "API_endpoint"
  | "class"
  | "function"
  | "file"
  | "ADR"
  | "decision"
  | "phase"
  | "feature"
  | "database_table"
  | "config"
  | "provider"
  | "evaluation_metric"
  | "safety_policy"
  | "agent"
  | "tool"
  | "document";

export type GraphRelationType =
  | "uses"
  | "depends_on"
  | "affects"
  | "implements"
  | "implemented_in"
  | "documented_in"
  | "configured_by"
  | "calls"
  | "owns"
  | "replaces"
  | "improves"
  | "evaluates"
  | "protects_against"
  | "introduced_in"
  | "deprecated_by"
  | "related_to"
  | "part_of"
  | "causes"
  | "requires"
  | "produces"
  | "consumes";

export interface GraphChunkRef {
  chunkId: string;
  documentId: string;
  sectionId: string;
  text: string;
}

export interface GraphEvidence {
  documentId: string;
  chunkId: string;
  sectionId?: string;
  text: string;
  extractionMethod?: string;
  confidence?: number;
}

export interface GraphNode {
  id: string;
  label: string;
  type: GraphEntityType;
  aliases: string[];
  description?: string;
  sourceDocumentIds: string[];
  sourceChunkIds: string[];
  confidence: number;
  properties: Record<string, string | number | boolean | null>;
  createdAt: string;
  updatedAt: string;
}

export interface EntityNode extends GraphNode {
  normalizedLabel: string;
  extractor?: string;
}

export interface GraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType: GraphRelationType;
  confidence: number;
  evidenceChunkIds: string[];
  evidenceText: string;
  extractionMethod: string;
  properties: Record<string, string | number | boolean | null>;
  createdAt: string;
  updatedAt: string;
}

export interface RelationEdge extends GraphEdge {}

export interface GraphTriple {
  id: string;
  subjectNodeId: string;
  predicate: GraphRelationType;
  objectNodeId: string;
  confidence: number;
  evidenceChunkIds: string[];
}

export interface GraphPath {
  nodeIds: string[];
  edgeIds: string[];
  length: number;
  confidence: number;
  evidenceChunkIds: string[];
}

export interface GraphSubgraph {
  nodes: EntityNode[];
  edges: RelationEdge[];
  triples: GraphTriple[];
  paths: GraphPath[];
}

export interface GraphExtractionTrace {
  extractionStartedAt: string;
  extractionEndedAt: string;
  entityCandidates: EntityCandidate[];
  resolvedEntities: EntityNode[];
  discardedEntities: Array<{ candidate: EntityCandidate; reason: string }>;
  relationCandidates: RelationCandidate[];
  persistedRelations: RelationEdge[];
  discardedRelations: Array<{ candidate: RelationCandidate; reason: string }>;
}

export interface KnowledgeGraph {
  nodes: EntityNode[];
  edges: RelationEdge[];
  triples: GraphTriple[];
  chunks: GraphChunkRef[];
  extractionTrace?: GraphExtractionTrace;
}

export interface ExtractedEntity {
  label: string;
  type?: GraphEntityType;
  aliases?: string[];
  confidence?: number;
  description?: string;
}

export interface EntityCandidate extends ExtractedEntity {
  canonicalLabel?: string;
  sourceChunkId: string;
  sourceDocumentId: string;
  extractionMethod: string;
}

export interface EntityExtractionContext {
  chunk: GraphChunkRef;
}

export interface EntityExtractor {
  name: string;
  extract(context: EntityExtractionContext): EntityCandidate[];
}

export interface EntityNormalizer {
  normalize(candidate: EntityCandidate): EntityCandidate;
}

export interface EntityAliasResolver {
  resolveAliases(candidate: EntityCandidate): string[];
}

export interface EntityDeduplicator {
  deduplicate(candidates: EntityCandidate[]): EntityCandidate[];
}

export interface EntityResolver {
  resolve(candidates: EntityCandidate[], graph: KnowledgeGraph): EntityNode[];
}

export interface RelationCandidate {
  sourceLabel: string;
  targetLabel: string;
  relationType: GraphRelationType;
  confidence: number;
  evidenceChunkId: string;
  evidenceText: string;
  extractionMethod: string;
}

export interface RelationExtractor {
  name: string;
  extract(chunk: GraphChunkRef, entities: EntityCandidate[]): RelationCandidate[];
}

export interface RelationNormalizer {
  normalize(candidate: RelationCandidate): RelationCandidate;
}

export interface RelationValidator {
  validate(candidate: RelationCandidate, nodes: Map<string, EntityNode>): boolean;
}

export interface TripleExtractor {
  extract(relations: RelationEdge[]): GraphTriple[];
}

export interface GraphPersistenceAdapter {
  save(graph: KnowledgeGraph): void;
  load(): KnowledgeGraph;
}

export interface GraphIndex {
  nodeById: Map<string, EntityNode>;
  edgesByNodeId: Map<string, RelationEdge[]>;
}

export interface GraphRepository {
  upsertNode(node: EntityNode): EntityNode;
  upsertEdge(edge: RelationEdge): RelationEdge;
  getNode(nodeId: string): EntityNode | undefined;
  getEdges(nodeId?: string): RelationEdge[];
  findNodes(query: string, type?: GraphEntityType): EntityNode[];
  findNeighbors(nodeId: string): EntityNode[];
  findPaths(sourceNodeId: string, targetNodeId: string, maxDepth?: number): GraphPath[];
  getSubgraph(nodeIds: string[], depth?: number): GraphSubgraph;
  deleteNode(nodeId: string): void;
  deleteEdge(edgeId: string): void;
  mergeNodes(primaryNodeId: string, duplicateNodeId: string): EntityNode | undefined;
  exportGraph(): KnowledgeGraph;
}

export interface GraphQueryEngine {
  queryNeighbors(nodeId: string): EntityNode[];
  querySubgraph(nodeIds: string[], depth?: number): GraphSubgraph;
}

export interface GraphStore extends GraphRepository, GraphQueryEngine {
  setGraph(graph: KnowledgeGraph): void;
  getGraph(): KnowledgeGraph;
  searchEntities(query: string, limit?: number): EntityHit[];
}

export interface EntityHit {
  entityId: string;
  label: string;
  type: GraphEntityType;
  score: number;
  chunkIds: string[];
}

export interface TraversalStep {
  fromEntityId: string;
  fromLabel: string;
  toEntityId: string;
  toLabel: string;
  relationType: GraphRelationType;
  depth: number;
  confidence: number;
  chunkIds: string[];
}

export interface GraphTraversalStrategy {
  traverse(graph: KnowledgeGraph, startingEntityIds: string[], maxDepth: number): TraversalStep[];
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

export interface GraphRetrieverOptions {
  topK?: number;
  maxDepth?: number;
}

export interface GraphRetrieverResult {
  entityHits: EntityHit[];
  traversalSteps: TraversalStep[];
  results: GraphRetrievalResult[];
}

export interface GraphEvidenceScorer {
  score(
    graphScore: number,
    vectorScore: number,
    edgeConfidence: number,
    pathLength: number,
    entityMatchConfidence: number
  ): number;
}

export interface HybridGraphRetrievalResult {
  chunkId: string;
  documentId: string;
  sectionId: string;
  text: string;
  combinedScore: number;
  vectorScore: number;
  graphScore: number;
  fusionBreakdown: {
    relationConfidence: number;
    pathLength: number;
    entityMatchConfidence: number;
    sourceDiversity: number;
  };
}

export interface GraphContextBuilder {
  build(
    graph: KnowledgeGraph,
    trace: GraphRetrieverResult
  ): { nodes: EntityNode[]; edges: RelationEdge[]; chunks: GraphChunkRef[] };
}

export interface GraphRetriever {
  retrieve(store: GraphStore, query: string, options?: GraphRetrieverOptions): GraphRetrieverResult;
}

export interface EntityExpansionRetriever {
  expand(store: GraphStore, query: string, depth?: number): GraphSubgraph;
}

export interface PathBasedRetriever {
  retrievePaths(store: GraphStore, sourceLabel: string, targetLabel: string, maxDepth?: number): GraphPath[];
}

export interface SubgraphRetriever {
  retrieve(store: GraphStore, seedNodeIds: string[], depth?: number): GraphSubgraph;
}

export interface GraphContextRanker {
  rank(results: HybridGraphRetrievalResult[]): HybridGraphRetrievalResult[];
}

export interface GraphVectorFusionEngine {
  fuse(
    vectorResults: Array<{ chunkId: string; score: number }>,
    graphTrace: GraphRetrieverResult,
    chunksById: Map<string, GraphChunkRef>
  ): HybridGraphRetrievalResult[];
}

export interface EntityValidationRule {
  validate(node: EntityNode): boolean;
}

export interface RelationValidationRule {
  validate(edge: RelationEdge, nodes: Map<string, EntityNode>): boolean;
}

export interface GraphConsistencyChecker {
  check(graph: KnowledgeGraph): string[];
}

export interface ConfidenceCalibrator {
  calibrate(confidence: number): number;
}

export interface GraphValidator {
  validate(graph: KnowledgeGraph): { valid: boolean; issues: string[] };
}

export interface LineageAnalyzer {
  traceDecision(nodeId: string, store: GraphStore): GraphPath[];
}

export interface ImpactAnalyzer {
  analyzeImpact(nodeId: string, store: GraphStore, depth?: number): GraphSubgraph;
}

export interface DependencyExplorer {
  exploreDependencies(nodeId: string, store: GraphStore, depth?: number): GraphSubgraph;
}

export interface DecisionTraceBuilder {
  build(nodeId: string, store: GraphStore): GraphSubgraph;
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
  "jwt",
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

const KNOWN_ALIAS_MAP = new Map<string, string>([
  ["jwt auth", "jwt authentication"],
  ["jwt authentication", "jwt authentication"],
  ["auth strategy using jwt", "jwt authentication"],
  ["api key", "api keys"],
  ["api keys", "api keys"],
  ["api-key auth", "api keys"],
]);

const PATTERN_RELATIONS: Array<{ regex: RegExp; relationType: GraphRelationType }> = [
  { regex: /\buses\b/i, relationType: "uses" },
  { regex: /\bdepends on\b/i, relationType: "depends_on" },
  { regex: /\baffects\b/i, relationType: "affects" },
  { regex: /\bimplemented in\b/i, relationType: "implemented_in" },
  { regex: /\bdocumented in\b/i, relationType: "documented_in" },
  { regex: /\bconfigured by\b/i, relationType: "configured_by" },
  { regex: /\bcalls\b/i, relationType: "calls" },
  { regex: /\breplaces\b/i, relationType: "replaces" },
  { regex: /\brequires\b/i, relationType: "requires" },
  { regex: /\bproduces\b/i, relationType: "produces" },
  { regex: /\bconsumes\b/i, relationType: "consumes" },
];

const ALLOWED_RELATIONS_BY_TYPE: Partial<Record<GraphEntityType, Set<GraphRelationType>>> = {
  ADR: new Set(["introduced_in", "documented_in", "replaces", "affects", "related_to"]),
  class: new Set(["calls", "depends_on", "implements", "part_of", "related_to"]),
  function: new Set(["calls", "depends_on", "implements", "related_to"]),
  API_endpoint: new Set(["uses", "calls", "depends_on", "implemented_in", "related_to"]),
};

class BasicEntityNormalizer implements EntityNormalizer {
  normalize(candidate: EntityCandidate): EntityCandidate {
    const canonical = canonicalizeLabel(candidate.label);
    return {
      ...candidate,
      label: candidate.label.trim(),
      canonicalLabel: canonical,
      type: candidate.type ?? inferEntityType(canonical),
      confidence: clamp(candidate.confidence ?? 0.6),
    };
  }
}

class BasicEntityAliasResolver implements EntityAliasResolver {
  resolveAliases(candidate: EntityCandidate): string[] {
    const aliases = new Set<string>(candidate.aliases ?? []);
    const canonical = canonicalizeLabel(candidate.label);
    if (candidate.label.trim().toLowerCase() !== canonical) {
      aliases.add(candidate.label.trim());
    }
    return [...aliases];
  }
}

class BasicEntityDeduplicator implements EntityDeduplicator {
  deduplicate(candidates: EntityCandidate[]): EntityCandidate[] {
    const byLabel = new Map<string, EntityCandidate>();

    for (const candidate of candidates) {
      const key = normalizeLabel(candidate.canonicalLabel ?? candidate.label);
      const existing = byLabel.get(key);
      if (!existing || (candidate.confidence ?? 0) > (existing.confidence ?? 0)) {
        byLabel.set(key, candidate);
      }
    }

    return [...byLabel.values()];
  }
}

class BasicEntityResolver implements EntityResolver {
  resolve(candidates: EntityCandidate[], graph: KnowledgeGraph): EntityNode[] {
    const now = new Date().toISOString();
    const byLabel = new Map(
      [...graph.nodes].map((node) => [normalizeLabel(node.normalizedLabel), node] as const)
    );
    const resolved: EntityNode[] = [];

    for (const candidate of candidates) {
      const normalizedLabel = normalizeLabel(candidate.canonicalLabel ?? candidate.label);
      const existing = byLabel.get(normalizedLabel);
      if (existing) {
        existing.confidence = clamp(Math.max(existing.confidence, candidate.confidence ?? 0.6));
        if (!existing.sourceChunkIds.includes(candidate.sourceChunkId)) {
          existing.sourceChunkIds.push(candidate.sourceChunkId);
        }
        if (!existing.sourceDocumentIds.includes(candidate.sourceDocumentId)) {
          existing.sourceDocumentIds.push(candidate.sourceDocumentId);
        }
        for (const alias of candidate.aliases ?? []) {
          if (!existing.aliases.includes(alias)) {
            existing.aliases.push(alias);
          }
        }
        existing.updatedAt = now;
        resolved.push(existing);
        continue;
      }

      const created: EntityNode = {
        id: `entity:${normalizedLabel}`,
        label: toDisplayLabel(candidate.canonicalLabel ?? candidate.label),
        normalizedLabel,
        type: candidate.type ?? inferEntityType(candidate.label),
        aliases: [...(candidate.aliases ?? [])],
        description: candidate.description,
        sourceDocumentIds: [candidate.sourceDocumentId],
        sourceChunkIds: [candidate.sourceChunkId],
        confidence: clamp(candidate.confidence ?? 0.6),
        properties: {},
        createdAt: now,
        updatedAt: now,
        extractor: candidate.extractionMethod,
      };
      byLabel.set(normalizedLabel, created);
      resolved.push(created);
    }

    return dedupeNodes(resolved);
  }
}

class PatternRelationExtractor implements RelationExtractor {
  name = "pattern";

  extract(chunk: GraphChunkRef, entities: EntityCandidate[]): RelationCandidate[] {
    const relations: RelationCandidate[] = [];
    const validEntities = entities.filter((entity) => entity.label.trim().length > 0);

    for (let index = 0; index < validEntities.length; index += 1) {
      for (let inner = index + 1; inner < validEntities.length; inner += 1) {
        const source = validEntities[index]!;
        const target = validEntities[inner]!;
        const relationType = inferPatternRelationType(chunk.text) ?? inferRelationType(source, target);
        relations.push({
          sourceLabel: source.canonicalLabel ?? source.label,
          targetLabel: target.canonicalLabel ?? target.label,
          relationType,
          confidence: 0.62,
          evidenceChunkId: chunk.chunkId,
          evidenceText: chunk.text,
          extractionMethod: this.name,
        });
      }
    }

    return relations;
  }
}

class CodeRelationExtractor implements RelationExtractor {
  name = "code";

  extract(chunk: GraphChunkRef, entities: EntityCandidate[]): RelationCandidate[] {
    const lower = chunk.text.toLowerCase();
    const hasImport = /\bimport\b/.test(lower);
    const hasCall = /\bcall(s)?\b|\(\)/.test(lower);
    if (!hasImport && !hasCall) {
      return [];
    }

    const pairs = pairEntities(entities);
    return pairs.map(([source, target]) => ({
      sourceLabel: source.canonicalLabel ?? source.label,
      targetLabel: target.canonicalLabel ?? target.label,
      relationType: hasCall ? "calls" : "depends_on",
      confidence: hasCall ? 0.65 : 0.6,
      evidenceChunkId: chunk.chunkId,
      evidenceText: chunk.text,
      extractionMethod: this.name,
    }));
  }
}

class AdrRelationExtractor implements RelationExtractor {
  name = "adr";

  extract(chunk: GraphChunkRef, entities: EntityCandidate[]): RelationCandidate[] {
    const lower = chunk.text.toLowerCase();
    const adrEntities = entities.filter((entity) => entity.type === "ADR");
    if (adrEntities.length === 0) {
      return [];
    }

    const relationType: GraphRelationType = /\bintroduces\b/.test(lower)
      ? "introduced_in"
      : /\breplaces\b/.test(lower)
      ? "replaces"
      : /\baffects\b/.test(lower)
      ? "affects"
      : "documented_in";

    return pairEntities(entities)
      .filter(([source, target]) => source.type === "ADR" || target.type === "ADR")
      .map(([source, target]) => ({
        sourceLabel: source.canonicalLabel ?? source.label,
        targetLabel: target.canonicalLabel ?? target.label,
        relationType,
        confidence: 0.7,
        evidenceChunkId: chunk.chunkId,
        evidenceText: chunk.text,
        extractionMethod: this.name,
      }));
  }
}

class BasicRelationNormalizer implements RelationNormalizer {
  normalize(candidate: RelationCandidate): RelationCandidate {
    return {
      ...candidate,
      sourceLabel: toDisplayLabel(candidate.sourceLabel),
      targetLabel: toDisplayLabel(candidate.targetLabel),
      confidence: clamp(candidate.confidence),
    };
  }
}

class BasicRelationValidator implements RelationValidator {
  validate(candidate: RelationCandidate, nodes: Map<string, EntityNode>): boolean {
    if (!candidate.evidenceChunkId || candidate.evidenceText.trim().length === 0) {
      return false;
    }
    if (candidate.confidence < 0.5) {
      return false;
    }

    const source = nodes.get(`entity:${normalizeLabel(candidate.sourceLabel)}`);
    if (!source) {
      return false;
    }

    const allowed = ALLOWED_RELATIONS_BY_TYPE[source.type];
    return !allowed || allowed.has(candidate.relationType) || candidate.relationType === "related_to";
  }
}

class DefaultTripleExtractor implements TripleExtractor {
  extract(relations: RelationEdge[]): GraphTriple[] {
    return relations.map((relation) => ({
      id: `triple:${relation.id}`,
      subjectNodeId: relation.sourceNodeId,
      predicate: relation.relationType,
      objectNodeId: relation.targetNodeId,
      confidence: relation.confidence,
      evidenceChunkIds: [...relation.evidenceChunkIds],
    }));
  }
}

class BasicGraphValidator implements GraphValidator, GraphConsistencyChecker, ConfidenceCalibrator {
  validate(graph: KnowledgeGraph): { valid: boolean; issues: string[] } {
    const issues = this.check(graph);
    return { valid: issues.length === 0, issues };
  }

  check(graph: KnowledgeGraph): string[] {
    const issues: string[] = [];
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    const chunkIds = new Set(graph.chunks.map((chunk) => chunk.chunkId));

    for (const node of graph.nodes) {
      if (node.sourceChunkIds.length === 0) {
        issues.push(`node:${node.id} has no evidence`);
      }
      if (node.confidence < 0.4) {
        issues.push(`node:${node.id} below confidence threshold`);
      }
      for (const sourceChunkId of node.sourceChunkIds) {
        if (!chunkIds.has(sourceChunkId)) {
          issues.push(`node:${node.id} references missing chunk:${sourceChunkId}`);
        }
      }
    }

    for (const edge of graph.edges) {
      if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
        issues.push(`edge:${edge.id} references missing node`);
      }
      if (edge.evidenceChunkIds.length === 0) {
        issues.push(`edge:${edge.id} has no evidence`);
      }
      if (edge.confidence < 0.5) {
        issues.push(`edge:${edge.id} below confidence threshold`);
      }
      for (const evidenceChunkId of edge.evidenceChunkIds) {
        if (!chunkIds.has(evidenceChunkId)) {
          issues.push(`edge:${edge.id} references missing chunk:${evidenceChunkId}`);
        }
      }
    }

    return [...new Set(issues)];
  }

  calibrate(confidence: number): number {
    return clamp(confidence);
  }
}

export function createRegexEntityExtractor(): EntityExtractor {
  return {
    name: "rule",
    extract({ chunk }) {
      const extracted: EntityCandidate[] = [];
      const seen = new Set<string>();
      const tokens = tokenize(chunk.text);

      for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index]!;
        if (isIgnoredToken(token)) {
          continue;
        }

        if (token.length >= 6 || PRIORITY_TERMS.has(token)) {
          pushEntityCandidate(extracted, seen, {
            label: toDisplayLabel(token),
            type: inferEntityType(token),
            confidence: PRIORITY_TERMS.has(token) ? 0.7 : 0.55,
            sourceChunkId: chunk.chunkId,
            sourceDocumentId: chunk.documentId,
            extractionMethod: "rule",
          });
        }

        const next = tokens[index + 1];
        if (next && !isIgnoredToken(next)) {
          pushEntityCandidate(extracted, seen, {
            label: toDisplayLabel(`${token} ${next}`),
            type: inferEntityType(`${token} ${next}`),
            confidence: 0.8,
            sourceChunkId: chunk.chunkId,
            sourceDocumentId: chunk.documentId,
            extractionMethod: "rule",
          });
        }
      }

      const adrMatches = chunk.text.match(/\bADR-\d{3}\b/gi) ?? [];
      for (const adr of adrMatches) {
        pushEntityCandidate(extracted, seen, {
          label: adr.toUpperCase(),
          type: "ADR",
          confidence: 0.92,
          sourceChunkId: chunk.chunkId,
          sourceDocumentId: chunk.documentId,
          extractionMethod: "rule",
        });
      }

      const fileMatches =
        chunk.text.match(/\b[\w-]+\.(ts|tsx|js|json|md|yaml|yml|sql|py|go|java)\b/g) ?? [];
      for (const fileName of fileMatches) {
        pushEntityCandidate(extracted, seen, {
          label: fileName,
          type: "file",
          confidence: 0.84,
          sourceChunkId: chunk.chunkId,
          sourceDocumentId: chunk.documentId,
          extractionMethod: "rule",
        });
      }

      const endpointMatches = chunk.text.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+\/[^\s)]+/gi) ?? [];
      for (const endpoint of endpointMatches) {
        pushEntityCandidate(extracted, seen, {
          label: endpoint.toUpperCase(),
          type: "API_endpoint",
          confidence: 0.86,
          sourceChunkId: chunk.chunkId,
          sourceDocumentId: chunk.documentId,
          extractionMethod: "rule",
        });
      }

      const packageMatches = chunk.text.match(/@[\w-]+\/[\w-]+/g) ?? [];
      for (const packageName of packageMatches) {
        pushEntityCandidate(extracted, seen, {
          label: packageName,
          type: "package",
          confidence: 0.8,
          sourceChunkId: chunk.chunkId,
          sourceDocumentId: chunk.documentId,
          extractionMethod: "rule",
        });
      }

      return extracted.slice(0, 24);
    },
  };
}

export class InMemoryGraphStore implements GraphStore {
  #graph: KnowledgeGraph = { nodes: [], edges: [], triples: [], chunks: [] };

  setGraph(graph: KnowledgeGraph): void {
    this.#graph = {
      ...graph,
      triples: graph.triples ?? new DefaultTripleExtractor().extract(graph.edges),
    };
  }

  getGraph(): KnowledgeGraph {
    return this.#graph;
  }

  upsertNode(node: EntityNode): EntityNode {
    const normalizedId = node.id || `entity:${normalizeLabel(node.label)}`;
    const existing = this.#graph.nodes.find((candidate) => candidate.id === normalizedId);
    if (!existing) {
      const created = {
        ...node,
        id: normalizedId,
        updatedAt: node.updatedAt ?? new Date().toISOString(),
        createdAt: node.createdAt ?? new Date().toISOString(),
      };
      this.#graph.nodes.push(created);
      return created;
    }

    const merged: EntityNode = {
      ...existing,
      ...node,
      id: normalizedId,
      aliases: [...new Set([...(existing.aliases ?? []), ...(node.aliases ?? [])])],
      sourceChunkIds: [...new Set([...(existing.sourceChunkIds ?? []), ...(node.sourceChunkIds ?? [])])],
      sourceDocumentIds: [...new Set([...(existing.sourceDocumentIds ?? []), ...(node.sourceDocumentIds ?? [])])],
      updatedAt: new Date().toISOString(),
    };

    this.#graph.nodes = this.#graph.nodes.map((candidate) =>
      candidate.id === normalizedId ? merged : candidate
    );
    return merged;
  }

  upsertEdge(edge: RelationEdge): RelationEdge {
    const normalizedId =
      edge.id || `edge:${edge.sourceNodeId}::${edge.relationType}::${edge.targetNodeId}`;
    const existing = this.#graph.edges.find((candidate) => candidate.id === normalizedId);
    if (!existing) {
      const created: RelationEdge = {
        ...edge,
        id: normalizedId,
        createdAt: edge.createdAt ?? new Date().toISOString(),
        updatedAt: edge.updatedAt ?? new Date().toISOString(),
      };
      this.#graph.edges.push(created);
      this.#graph.triples = new DefaultTripleExtractor().extract(this.#graph.edges);
      return created;
    }

    const merged: RelationEdge = {
      ...existing,
      ...edge,
      id: normalizedId,
      confidence: Math.max(existing.confidence, edge.confidence),
      evidenceChunkIds: [
        ...new Set([...(existing.evidenceChunkIds ?? []), ...(edge.evidenceChunkIds ?? [])]),
      ],
      updatedAt: new Date().toISOString(),
    };
    this.#graph.edges = this.#graph.edges.map((candidate) =>
      candidate.id === normalizedId ? merged : candidate
    );
    this.#graph.triples = new DefaultTripleExtractor().extract(this.#graph.edges);
    return merged;
  }

  getNode(nodeId: string): EntityNode | undefined {
    return this.#graph.nodes.find((node) => node.id === nodeId);
  }

  getEdges(nodeId?: string): RelationEdge[] {
    if (!nodeId) {
      return [...this.#graph.edges];
    }

    return this.#graph.edges.filter(
      (edge) => edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId
    );
  }

  findNodes(query: string, type?: GraphEntityType): EntityNode[] {
    const normalized = normalizeLabel(query);
    return this.#graph.nodes.filter((node) => {
      if (type && node.type !== type) {
        return false;
      }
      return (
        normalizeLabel(node.label).includes(normalized) ||
        node.aliases.some((alias) => normalizeLabel(alias).includes(normalized))
      );
    });
  }

  findNeighbors(nodeId: string): EntityNode[] {
    const nodeIds = new Set(
      this.getEdges(nodeId).map((edge) => (edge.sourceNodeId === nodeId ? edge.targetNodeId : edge.sourceNodeId))
    );
    return this.#graph.nodes.filter((node) => nodeIds.has(node.id));
  }

  findPaths(sourceNodeId: string, targetNodeId: string, maxDepth = 3): GraphPath[] {
    if (sourceNodeId === targetNodeId) {
      return [{ nodeIds: [sourceNodeId], edgeIds: [], length: 0, confidence: 1, evidenceChunkIds: [] }];
    }

    const adjacency = new Map<string, RelationEdge[]>();
    for (const edge of this.#graph.edges) {
      adjacency.set(edge.sourceNodeId, [...(adjacency.get(edge.sourceNodeId) ?? []), edge]);
      adjacency.set(edge.targetNodeId, [...(adjacency.get(edge.targetNodeId) ?? []), edge]);
    }

    const queue: Array<{ nodeId: string; nodeIds: string[]; edgeIds: string[]; confidence: number }> =
      [{ nodeId: sourceNodeId, nodeIds: [sourceNodeId], edgeIds: [], confidence: 1 }];
    const paths: GraphPath[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.edgeIds.length >= maxDepth) {
        continue;
      }

      for (const edge of adjacency.get(current.nodeId) ?? []) {
        const nextNodeId = edge.sourceNodeId === current.nodeId ? edge.targetNodeId : edge.sourceNodeId;
        if (current.nodeIds.includes(nextNodeId)) {
          continue;
        }
        const nodeIds = [...current.nodeIds, nextNodeId];
        const edgeIds = [...current.edgeIds, edge.id];
        const confidence = clamp(current.confidence * edge.confidence);

        if (nextNodeId === targetNodeId) {
          paths.push({
            nodeIds,
            edgeIds,
            length: edgeIds.length,
            confidence,
            evidenceChunkIds: [...new Set(edgeIds.flatMap((id) => this.getEdgeById(id)?.evidenceChunkIds ?? []))],
          });
          continue;
        }

        queue.push({ nodeId: nextNodeId, nodeIds, edgeIds, confidence });
      }
    }

    return paths.sort((left, right) => right.confidence - left.confidence);
  }

  getSubgraph(nodeIds: string[], depth = 1): GraphSubgraph {
    const frontier = [...new Set(nodeIds)];
    const visited = new Set(frontier);
    const includedEdges = new Set<string>();
    let remainingDepth = depth;

    while (frontier.length > 0 && remainingDepth > 0) {
      const currentLayer = frontier.splice(0, frontier.length);
      for (const nodeId of currentLayer) {
        for (const edge of this.getEdges(nodeId)) {
          includedEdges.add(edge.id);
          const next = edge.sourceNodeId === nodeId ? edge.targetNodeId : edge.sourceNodeId;
          if (!visited.has(next)) {
            visited.add(next);
            frontier.push(next);
          }
        }
      }
      remainingDepth -= 1;
    }

    const nodes = this.#graph.nodes.filter((node) => visited.has(node.id));
    const edges = this.#graph.edges.filter((edge) => includedEdges.has(edge.id));
    const triples = this.#graph.triples.filter((triple) =>
      edges.some((edge) => `triple:${edge.id}` === triple.id)
    );
    return { nodes, edges, triples, paths: [] };
  }

  deleteNode(nodeId: string): void {
    this.#graph.nodes = this.#graph.nodes.filter((node) => node.id !== nodeId);
    this.#graph.edges = this.#graph.edges.filter(
      (edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId
    );
    this.#graph.triples = new DefaultTripleExtractor().extract(this.#graph.edges);
  }

  deleteEdge(edgeId: string): void {
    this.#graph.edges = this.#graph.edges.filter((edge) => edge.id !== edgeId);
    this.#graph.triples = new DefaultTripleExtractor().extract(this.#graph.edges);
  }

  mergeNodes(primaryNodeId: string, duplicateNodeId: string): EntityNode | undefined {
    const primary = this.getNode(primaryNodeId);
    const duplicate = this.getNode(duplicateNodeId);
    if (!primary || !duplicate) {
      return undefined;
    }

    const merged = this.upsertNode({
      ...primary,
      aliases: [...new Set([...primary.aliases, duplicate.label, ...duplicate.aliases])],
      sourceChunkIds: [...new Set([...primary.sourceChunkIds, ...duplicate.sourceChunkIds])],
      sourceDocumentIds: [...new Set([...primary.sourceDocumentIds, ...duplicate.sourceDocumentIds])],
      confidence: Math.max(primary.confidence, duplicate.confidence),
    });

    this.#graph.edges = this.#graph.edges.map((edge) => ({
      ...edge,
      sourceNodeId: edge.sourceNodeId === duplicateNodeId ? primaryNodeId : edge.sourceNodeId,
      targetNodeId: edge.targetNodeId === duplicateNodeId ? primaryNodeId : edge.targetNodeId,
    }));
    this.deleteNode(duplicateNodeId);
    return merged;
  }

  exportGraph(): KnowledgeGraph {
    return {
      nodes: [...this.#graph.nodes],
      edges: [...this.#graph.edges],
      triples: [...this.#graph.triples],
      chunks: [...this.#graph.chunks],
      extractionTrace: this.#graph.extractionTrace,
    };
  }

  queryNeighbors(nodeId: string): EntityNode[] {
    return this.findNeighbors(nodeId);
  }

  querySubgraph(nodeIds: string[], depth = 1): GraphSubgraph {
    return this.getSubgraph(nodeIds, depth);
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
        const aliasOverlap = node.aliases.reduce((best, alias) => {
          const aliasTokens = new Set(tokenize(alias));
          const current = [...aliasTokens].filter((token) => queryTokens.has(token)).length;
          return Math.max(best, current);
        }, 0);
        const baseScore =
          overlap === 0 && aliasOverlap === 0
            ? 0
            : Math.max(overlap, aliasOverlap) / Math.sqrt(Math.max(nodeTokens.size, 1) * queryTokens.size);
        const score = clamp(baseScore * node.confidence);

        return {
          entityId: node.id,
          label: node.label,
          type: node.type,
          score: Number(score.toFixed(6)),
          chunkIds: [...node.sourceChunkIds],
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

  private getEdgeById(edgeId: string): RelationEdge | undefined {
    return this.#graph.edges.find((edge) => edge.id === edgeId);
  }
}

export class BreadthFirstTraversalStrategy implements GraphTraversalStrategy {
  traverse(graph: KnowledgeGraph, startingEntityIds: string[], maxDepth: number): TraversalStep[] {
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node] as const));
    const adjacency = new Map<string, RelationEdge[]>();

    for (const edge of graph.edges) {
      adjacency.set(edge.sourceNodeId, [...(adjacency.get(edge.sourceNodeId) ?? []), edge]);
      adjacency.set(edge.targetNodeId, [...(adjacency.get(edge.targetNodeId) ?? []), edge]);
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
        const targetId =
          edge.sourceNodeId === current.entityId ? edge.targetNodeId : edge.sourceNodeId;
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
          relationType: edge.relationType,
          depth: current.depth + 1,
          confidence: edge.confidence,
          chunkIds: [...edge.evidenceChunkIds],
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

class DefaultGraphRetriever implements GraphRetriever {
  retrieve(store: GraphStore, query: string, options: GraphRetrieverOptions = {}): GraphRetrieverResult {
    return retrieveFromKnowledgeGraph(store, query, options);
  }
}

class DefaultEntityExpansionRetriever implements EntityExpansionRetriever {
  expand(store: GraphStore, query: string, depth = 1): GraphSubgraph {
    const hits = store.searchEntities(query, 5);
    return store.getSubgraph(
      hits.map((hit) => hit.entityId),
      depth
    );
  }
}

class DefaultPathBasedRetriever implements PathBasedRetriever {
  retrievePaths(store: GraphStore, sourceLabel: string, targetLabel: string, maxDepth = 3): GraphPath[] {
    const source = store.findNodes(sourceLabel)[0];
    const target = store.findNodes(targetLabel)[0];
    if (!source || !target) {
      return [];
    }
    return store.findPaths(source.id, target.id, maxDepth);
  }
}

class DefaultSubgraphRetriever implements SubgraphRetriever {
  retrieve(store: GraphStore, seedNodeIds: string[], depth = 1): GraphSubgraph {
    return store.getSubgraph(seedNodeIds, depth);
  }
}

class DefaultGraphContextBuilder implements GraphContextBuilder {
  build(
    graph: KnowledgeGraph,
    trace: GraphRetrieverResult
  ): { nodes: EntityNode[]; edges: RelationEdge[]; chunks: GraphChunkRef[] } {
    const nodeIds = new Set(trace.entityHits.map((hit) => hit.entityId));
    for (const step of trace.traversalSteps) {
      nodeIds.add(step.fromEntityId);
      nodeIds.add(step.toEntityId);
    }
    const chunkIds = new Set(trace.results.map((result) => result.chunkId));

    return {
      nodes: graph.nodes.filter((node) => nodeIds.has(node.id)),
      edges: graph.edges.filter(
        (edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId)
      ),
      chunks: graph.chunks.filter((chunk) => chunkIds.has(chunk.chunkId)),
    };
  }
}

class DefaultGraphEvidenceScorer implements GraphEvidenceScorer {
  score(
    graphScore: number,
    vectorScore: number,
    edgeConfidence: number,
    pathLength: number,
    entityMatchConfidence: number
  ): number {
    const pathFactor = pathLength <= 0 ? 1 : 1 / (pathLength + 1);
    return Number(
      clamp(
        vectorScore * 0.45 +
          graphScore * 0.35 +
          edgeConfidence * 0.12 +
          entityMatchConfidence * 0.08
      ).toFixed(6)
    ) * pathFactor;
  }
}

class DefaultGraphContextRanker implements GraphContextRanker {
  rank(results: HybridGraphRetrievalResult[]): HybridGraphRetrievalResult[] {
    return [...results].sort((left, right) => right.combinedScore - left.combinedScore);
  }
}

export class DefaultGraphVectorFusionEngine implements GraphVectorFusionEngine {
  private readonly scorer = new DefaultGraphEvidenceScorer();
  private readonly ranker = new DefaultGraphContextRanker();

  fuse(
    vectorResults: Array<{ chunkId: string; score: number }>,
    graphTrace: GraphRetrieverResult,
    chunksById: Map<string, GraphChunkRef>
  ): HybridGraphRetrievalResult[] {
    const vectorByChunkId = new Map(vectorResults.map((entry) => [entry.chunkId, entry.score] as const));
    const fused: HybridGraphRetrievalResult[] = [];

    for (const result of graphTrace.results) {
      const chunk = chunksById.get(result.chunkId);
      if (!chunk) {
        continue;
      }
      const vectorScore = vectorByChunkId.get(result.chunkId) ?? 0;
      const combinedScore = this.scorer.score(
        result.score,
        vectorScore,
        result.edgeConfidence,
        result.depth,
        Math.min(1, result.matchedEntities.length / 3)
      );
      fused.push({
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        sectionId: chunk.sectionId,
        text: chunk.text,
        combinedScore: Number(combinedScore.toFixed(6)),
        vectorScore: Number(vectorScore.toFixed(6)),
        graphScore: result.score,
        fusionBreakdown: {
          relationConfidence: result.edgeConfidence,
          pathLength: result.depth,
          entityMatchConfidence: Math.min(1, result.matchedEntities.length / 3),
          sourceDiversity: 1,
        },
      });
    }

    return this.ranker.rank(fused);
  }
}

class DefaultLineageAnalyzer
  implements LineageAnalyzer, ImpactAnalyzer, DependencyExplorer, DecisionTraceBuilder
{
  traceDecision(nodeId: string, store: GraphStore): GraphPath[] {
    const graph = store.getGraph();
    const decisions = graph.nodes.filter((node) => node.type === "decision" || node.type === "ADR");
    return decisions.flatMap((decision) => store.findPaths(decision.id, nodeId, 3));
  }

  analyzeImpact(nodeId: string, store: GraphStore, depth = 2): GraphSubgraph {
    return store.getSubgraph([nodeId], depth);
  }

  exploreDependencies(nodeId: string, store: GraphStore, depth = 2): GraphSubgraph {
    return store.getSubgraph([nodeId], depth);
  }

  build(nodeId: string, store: GraphStore): GraphSubgraph {
    return store.getSubgraph([nodeId], 2);
  }
}

export interface BuildKnowledgeGraphOptions {
  extractors?: EntityExtractor[];
  relationExtractors?: RelationExtractor[];
  minRelationConfidence?: number;
}

export function buildKnowledgeGraph(
  chunks: GraphChunkRef[],
  options: BuildKnowledgeGraphOptions = {}
): KnowledgeGraph {
  const startedAt = new Date().toISOString();
  const graph: KnowledgeGraph = { nodes: [], edges: [], triples: [], chunks: [...chunks] };
  const normalizer = new BasicEntityNormalizer();
  const aliasResolver = new BasicEntityAliasResolver();
  const deduplicator = new BasicEntityDeduplicator();
  const resolver = new BasicEntityResolver();
  const relationNormalizer = new BasicRelationNormalizer();
  const relationValidator = new BasicRelationValidator();
  const tripleExtractor = new DefaultTripleExtractor();
  const validator = new BasicGraphValidator();

  const extractors = options.extractors ?? [createRegexEntityExtractor()];
  const relationExtractors = options.relationExtractors ?? [
    new PatternRelationExtractor(),
    new CodeRelationExtractor(),
    new AdrRelationExtractor(),
  ];
  const minRelationConfidence = options.minRelationConfidence ?? 0.5;

  const entityCandidates: EntityCandidate[] = [];
  const discardedEntities: Array<{ candidate: EntityCandidate; reason: string }> = [];
  const relationCandidates: RelationCandidate[] = [];
  const discardedRelations: Array<{ candidate: RelationCandidate; reason: string }> = [];
  const persistedRelations: RelationEdge[] = [];

  for (const chunk of chunks) {
    const chunkCandidates = extractors.flatMap((extractor) =>
      extractor.extract({ chunk }).map((candidate) => ({
        ...candidate,
        sourceChunkId: candidate.sourceChunkId ?? chunk.chunkId,
        sourceDocumentId: candidate.sourceDocumentId ?? chunk.documentId,
        extractionMethod: candidate.extractionMethod ?? extractor.name,
      }))
    );

    const normalized = chunkCandidates
      .map((candidate) => normalizer.normalize(candidate))
      .map((candidate) => ({
        ...candidate,
        aliases: aliasResolver.resolveAliases(candidate),
      }))
      .filter((candidate) => {
        if (!candidate.canonicalLabel || candidate.canonicalLabel.length === 0) {
          discardedEntities.push({ candidate, reason: "empty_label" });
          return false;
        }
        return true;
      });

    const deduped = deduplicator.deduplicate(normalized);
    entityCandidates.push(...deduped);
    const resolved = resolver.resolve(deduped, graph);
    for (const node of resolved) {
      upsertNode(graph, node);
    }

    for (const extractor of relationExtractors) {
      relationCandidates.push(...extractor.extract(chunk, deduped));
    }
  }

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node] as const));
  for (const candidate of relationCandidates) {
    const normalized = relationNormalizer.normalize(candidate);
    if (normalized.confidence < minRelationConfidence) {
      discardedRelations.push({ candidate: normalized, reason: "low_confidence" });
      continue;
    }

    const sourceNodeId = `entity:${normalizeLabel(normalized.sourceLabel)}`;
    const targetNodeId = `entity:${normalizeLabel(normalized.targetLabel)}`;
    const sourceNode = nodesById.get(sourceNodeId);
    const targetNode = nodesById.get(targetNodeId);
    if (!sourceNode || !targetNode) {
      discardedRelations.push({ candidate: normalized, reason: "missing_nodes" });
      continue;
    }

    if (!relationValidator.validate(normalized, nodesById)) {
      discardedRelations.push({ candidate: normalized, reason: "validation_failed" });
      continue;
    }

    const edge = upsertEdge(graph, {
      id: `edge:${sourceNodeId}::${normalized.relationType}::${targetNodeId}`,
      sourceNodeId,
      targetNodeId,
      relationType: normalized.relationType,
      confidence: normalized.confidence,
      evidenceChunkIds: [normalized.evidenceChunkId],
      evidenceText: normalized.evidenceText,
      extractionMethod: normalized.extractionMethod,
      properties: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    persistedRelations.push(edge);
  }

  graph.triples = tripleExtractor.extract(graph.edges);
  graph.extractionTrace = {
    extractionStartedAt: startedAt,
    extractionEndedAt: new Date().toISOString(),
    entityCandidates,
    resolvedEntities: [...graph.nodes],
    discardedEntities,
    relationCandidates,
    persistedRelations,
    discardedRelations,
  };

  const validation = validator.validate(graph);
  if (!validation.valid) {
    graph.extractionTrace.discardedRelations.push(
      ...validation.issues.map((issue) => ({
        candidate: {
          sourceLabel: "graph",
          targetLabel: "graph",
          relationType: "related_to",
          confidence: 0,
          evidenceChunkId: "validation",
          evidenceText: issue,
          extractionMethod: "validator",
        } satisfies RelationCandidate,
        reason: issue,
      }))
    );
  }

  graph.nodes.sort((left, right) => left.label.localeCompare(right.label));
  graph.edges.sort((left, right) => left.id.localeCompare(right.id));
  graph.triples.sort((left, right) => left.id.localeCompare(right.id));
  return graph;
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
  const chunksById = new Map(graph.chunks.map((chunk) => [chunk.chunkId, chunk] as const));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node] as const));
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
    for (const chunkId of toNode.sourceChunkIds) {
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

export const defaultGraphRetriever: GraphRetriever = new DefaultGraphRetriever();
export const defaultEntityExpansionRetriever: EntityExpansionRetriever =
  new DefaultEntityExpansionRetriever();
export const defaultPathBasedRetriever: PathBasedRetriever = new DefaultPathBasedRetriever();
export const defaultSubgraphRetriever: SubgraphRetriever = new DefaultSubgraphRetriever();
export const defaultGraphContextBuilder: GraphContextBuilder = new DefaultGraphContextBuilder();
export const defaultLineageAnalyzer: LineageAnalyzer = new DefaultLineageAnalyzer();
export const defaultImpactAnalyzer: ImpactAnalyzer = new DefaultLineageAnalyzer();
export const defaultDependencyExplorer: DependencyExplorer = new DefaultLineageAnalyzer();
export const defaultDecisionTraceBuilder: DecisionTraceBuilder = new DefaultLineageAnalyzer();

function upsertNode(graph: KnowledgeGraph, node: EntityNode): EntityNode {
  const existing = graph.nodes.find((candidate) => candidate.id === node.id);
  if (!existing) {
    graph.nodes.push(node);
    return node;
  }

  existing.aliases = [...new Set([...existing.aliases, ...node.aliases])];
  existing.sourceChunkIds = [...new Set([...existing.sourceChunkIds, ...node.sourceChunkIds])];
  existing.sourceDocumentIds = [...new Set([...existing.sourceDocumentIds, ...node.sourceDocumentIds])];
  existing.confidence = Math.max(existing.confidence, node.confidence);
  existing.updatedAt = new Date().toISOString();
  return existing;
}

function upsertEdge(graph: KnowledgeGraph, edge: RelationEdge): RelationEdge {
  const existing = graph.edges.find((candidate) => candidate.id === edge.id);
  if (!existing) {
    graph.edges.push(edge);
    return edge;
  }

  if (edge.confidence >= existing.confidence) {
    existing.confidence = edge.confidence;
    existing.relationType = edge.relationType;
  }
  existing.evidenceChunkIds = [...new Set([...existing.evidenceChunkIds, ...edge.evidenceChunkIds])];
  existing.updatedAt = new Date().toISOString();
  return existing;
}

function pairEntities(entities: EntityCandidate[]): Array<[EntityCandidate, EntityCandidate]> {
  const pairs: Array<[EntityCandidate, EntityCandidate]> = [];
  for (let index = 0; index < entities.length; index += 1) {
    for (let inner = index + 1; inner < entities.length; inner += 1) {
      pairs.push([entities[index]!, entities[inner]!]);
    }
  }
  return pairs;
}

function pushEntityCandidate(
  target: EntityCandidate[],
  seen: Set<string>,
  candidate: EntityCandidate
): void {
  const normalized = normalizeLabel(candidate.label);
  if (normalized.length === 0 || seen.has(normalized)) {
    return;
  }
  seen.add(normalized);
  target.push(candidate);
}

function dedupeNodes(nodes: EntityNode[]): EntityNode[] {
  const byId = new Map<string, EntityNode>();
  for (const node of nodes) {
    if (!byId.has(node.id)) {
      byId.set(node.id, node);
      continue;
    }
    const existing = byId.get(node.id)!;
    existing.aliases = [...new Set([...existing.aliases, ...node.aliases])];
    existing.sourceChunkIds = [...new Set([...existing.sourceChunkIds, ...node.sourceChunkIds])];
    existing.sourceDocumentIds = [...new Set([...existing.sourceDocumentIds, ...node.sourceDocumentIds])];
    existing.confidence = Math.max(existing.confidence, node.confidence);
  }
  return [...byId.values()];
}

function inferPatternRelationType(text: string): GraphRelationType | undefined {
  for (const entry of PATTERN_RELATIONS) {
    if (entry.regex.test(text)) {
      return entry.relationType;
    }
  }
  return undefined;
}

function inferRelationType(source: EntityCandidate, target: EntityCandidate): GraphRelationType {
  if (source.type === "ADR" || target.type === "ADR") {
    return "documented_in";
  }
  if (source.type === "API_endpoint" || target.type === "API_endpoint") {
    return "uses";
  }
  if (source.type === "class" || source.type === "function") {
    return "calls";
  }
  if (source.type === "module" || target.type === "module") {
    return "depends_on";
  }
  return "related_to";
}

function clamp(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(6));
}

function canonicalizeLabel(label: string): string {
  const normalized = normalizeLabel(label);
  return KNOWN_ALIAS_MAP.get(normalized) ?? normalized;
}

function isIgnoredToken(token: string): boolean {
  return STOP_WORDS.has(token) || token.length <= 2;
}

function tokenize(text: string): string[] {
  return text.normalize("NFKC").toLowerCase().match(/[a-z0-9/_-]+(?:\.[a-z0-9]+)*/g) ?? [];
}

function normalizeLabel(text: string): string {
  return tokenize(text).join(" ").trim();
}

function toDisplayLabel(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function inferEntityType(label: string): GraphEntityType {
  const normalized = normalizeLabel(label);

  if (/\badr-\d{3}\b/.test(normalized)) {
    return "ADR";
  }
  if (/\b(get|post|put|patch|delete)\s+\//.test(normalized) || normalized.includes("/")) {
    return "API_endpoint";
  }
  if (normalized.endsWith(".ts") || normalized.endsWith(".tsx") || normalized.endsWith(".md")) {
    return "file";
  }
  if (normalized.includes("class")) {
    return "class";
  }
  if (normalized.includes("function")) {
    return "function";
  }
  if (normalized.includes("provider")) {
    return "provider";
  }
  if (normalized.includes("policy")) {
    return "safety_policy";
  }
  if (normalized.includes("eval") || normalized.includes("metric")) {
    return "evaluation_metric";
  }
  if (normalized.includes("module")) {
    return "module";
  }
  if (normalized.includes("package") || normalized.startsWith("@")) {
    return "package";
  }
  if (normalized.includes("phase")) {
    return "phase";
  }
  if (normalized.includes("feature")) {
    return "feature";
  }
  if (normalized.includes("decision")) {
    return "decision";
  }
  if (normalized.includes("table")) {
    return "database_table";
  }
  if (normalized.includes("config")) {
    return "config";
  }
  if (normalized.includes("agent")) {
    return "agent";
  }
  if (normalized.includes("tool")) {
    return "tool";
  }
  if (normalized.includes("doc")) {
    return "document";
  }
  if (normalized.includes("architecture") || normalized.includes("component")) {
    return "architecture_component";
  }
  if (normalized.includes("jwt") || normalized.includes("api key")) {
    return "technology";
  }
  return "concept";
}
