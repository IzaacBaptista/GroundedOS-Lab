import type {
  CompressionTrace,
  EpisodicMemoryEntry,
  EpisodeGraphEdge,
  FactExtractionResult,
  FactConfidence,
  LongTermMemoryState,
  MemoryCompressionResult,
  MemoryConsolidationResult,
  MemoryDecayState,
  MemoryEntry,
  MemoryHierarchyRequest,
  MemoryHierarchySnapshot,
  MemoryImportanceScore,
  MemoryManager as MemoryManagerContract,
  MemoryPriority,
  MemoryRetrievalResult,
  MemoryRetrievalResultItem,
  MemoryRetentionClass,
  MemorySelectionTrace,
  SemanticFact,
  SemanticMemoryState,
  SessionMemoryStore,
  WorkingMemoryItem,
  WorkingMemoryState,
} from "./types";

const DEFAULT_MEMORY_WINDOW = 6;
const DEFAULT_MAX_WORKING_TOKENS = 240;
const DEFAULT_IMPORTANCE_THRESHOLD = 0.55;
const DEFAULT_RETRIEVAL_LIMIT = 6;
const ENTRY_READ_LIMIT = 10_000;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
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
  "to",
  "we",
  "what",
  "when",
  "which",
  "with",
]);

export class MemoryPriorityClassifier {
  classify(score: number): MemoryPriority {
    if (score >= 0.9) {
      return "persistent";
    }
    if (score >= 0.78) {
      return "critical";
    }
    if (score >= 0.62) {
      return "important";
    }
    if (score >= 0.4) {
      return "useful";
    }
    return "transient";
  }
}

export class MemoryDecayPolicy {
  constructor(private readonly archiveThreshold = 0.35, private readonly compactThreshold = 0.55) {}

  classify(score: number): "archive" | "compact" | "retain" {
    if (score < this.archiveThreshold) {
      return "archive";
    }
    if (score < this.compactThreshold) {
      return "compact";
    }
    return "retain";
  }
}

export class MemoryRetentionPolicy {
  constructor(
    private readonly classifier = new MemoryPriorityClassifier(),
    private readonly threshold = DEFAULT_IMPORTANCE_THRESHOLD
  ) {}

  classify(score: number): MemoryRetentionClass {
    return this.classifier.classify(score);
  }

  shouldPersist(score: number): boolean {
    return score >= this.threshold;
  }
}

export class MemoryImportanceScorer {
  constructor(private readonly retentionPolicy = new MemoryRetentionPolicy()) {}

  score(
    entry: MemoryEntry,
    context: {
      newestTimestamp: number;
      duplicateCount: number;
      queryTokens: Set<string>;
    }
  ): MemoryImportanceScore {
    const entryTokens = tokenize(`${entry.query} ${entry.answer}`);
    const ageMs = Math.max(0, context.newestTimestamp - entry.createdAt);
    const recency = clamp01(1 - ageMs / Math.max(context.newestTimestamp || 1, 1));
    const frequency = clamp01(context.duplicateCount / 3);
    const taskImpact = containsAny(entry.query, ["plan", "objective", "decision", "fix", "implement"])
      ? 0.9
      : 0.45;
    const explicitPreference = isTruthyMetadata(entry.metadata?.["persistent"]) ? 1 : 0;
    const factuality = containsFactualCue(entry.answer) ? 0.8 : 0.35;
    const emotionalSalience = containsAny(entry.query, ["important", "critical", "urgent"]) ? 0.4 : 0.05;
    const planningRelevance = containsAny(entry.query, ["plan", "next", "step", "strategy"]) ? 0.85 : 0.35;
    const retrievalUsefulness = clamp01(overlapScore(context.queryTokens, entryTokens));
    const userCorrection = containsAny(`${entry.query} ${entry.answer}`, ["correct", "update", "change"]) ? 0.8 : 0;
    const futureUtility = containsAny(entry.query, ["how", "why", "configure", "support", "architecture"])
      ? 0.8
      : 0.3;

    const score = roundScore(
      frequency * 0.08 +
        recency * 0.16 +
        taskImpact * 0.12 +
        explicitPreference * 0.1 +
        factuality * 0.12 +
        emotionalSalience * 0.04 +
        planningRelevance * 0.12 +
        retrievalUsefulness * 0.14 +
        userCorrection * 0.06 +
        futureUtility * 0.06
    );

    return {
      score,
      classification: this.retentionPolicy.classify(score),
      signals: {
        frequency: roundScore(frequency),
        recency: roundScore(recency),
        taskImpact: roundScore(taskImpact),
        explicitPreference: roundScore(explicitPreference),
        factuality: roundScore(factuality),
        emotionalSalience: roundScore(emotionalSalience),
        planningRelevance: roundScore(planningRelevance),
        retrievalUsefulness: roundScore(retrievalUsefulness),
        userCorrection: roundScore(userCorrection),
        futureUtility: roundScore(futureUtility),
      },
    };
  }
}

export class RollingSummarizer {
  summarize(entries: MemoryEntry[]): { short: string; medium: string; long: string } {
    if (entries.length === 0) {
      return {
        short: "No episodic activity recorded.",
        medium: "No episodic activity recorded.",
        long: "No episodic activity recorded.",
      };
    }

    const actions = entries.map((entry) => normalizeSentence(entry.query));
    const outcomes = entries.map((entry) => normalizeSentence(firstSentence(entry.answer)));
    const short = truncate(`${actions[0]} → ${outcomes[outcomes.length - 1]}`, 140);
    const medium = truncate(
      entries
        .slice(0, 3)
        .map((entry) => `${normalizeSentence(entry.query)} → ${normalizeSentence(firstSentence(entry.answer))}`)
        .join(" · "),
      280
    );
    const long = truncate(
      entries
        .map((entry) => `Q: ${normalizeSentence(entry.query)} A: ${normalizeSentence(firstSentence(entry.answer))}`)
        .join(" | "),
      560
    );

    return { short, medium, long };
  }
}

export class SemanticCompressor {
  compress(text: string): string {
    return truncate(
      text
        .split(/\s+/)
        .filter((token) => token.trim().length > 0)
        .filter((token, index, tokens) => index === 0 || token.toLowerCase() !== tokens[index - 1]?.toLowerCase())
        .join(" "),
      280
    );
  }
}

export class MemoryDistiller {
  constructor(
    private readonly summarizer = new RollingSummarizer(),
    private readonly compressor = new SemanticCompressor()
  ) {}

  distill(entries: MemoryEntry[]) {
    const summary = this.summarizer.summarize(entries);
    return {
      short: this.compressor.compress(summary.short),
      medium: this.compressor.compress(summary.medium),
      long: this.compressor.compress(summary.long),
    };
  }
}

export class FactValidator {
  isValid(text: string): boolean {
    const normalized = text.trim();
    return normalized.length >= 12 && /\b(is|are|uses|supports|exists|implemented|stores|retrieves|keeps)\b/i.test(normalized);
  }
}

export class FactConflictResolver {
  resolve(facts: SemanticFact[]): { facts: SemanticFact[]; mergedCount: number } {
    const grouped = new Map<string, SemanticFact[]>();

    for (const fact of facts) {
      const key = normalizeFactKey(fact.text);
      const list = grouped.get(key) ?? [];
      list.push(fact);
      grouped.set(key, list);
    }

    const mergedFacts = Array.from(grouped.values()).map((group) => {
      if (group.length === 1) {
        return group[0]!;
      }

      const [first, ...rest] = group;
      return {
        ...first,
        provenance: Array.from(new Set(group.flatMap((item) => item.provenance))),
        sourceEpisodes: Array.from(new Set(group.flatMap((item) => item.sourceEpisodes))),
        updateHistory: [
          ...first.updateHistory,
          ...rest.map((item) => `Merged duplicate fact ${item.factId}`),
        ],
        conflictMetadata: {
          conflictsWith: [],
          status: "merged" as const,
        },
        confidence: mergeConfidence(group.map((item) => item.confidence)),
      };
    });

    return {
      facts: mergedFacts,
      mergedCount: facts.length - mergedFacts.length,
    };
  }
}

export class FactExtractor {
  constructor(
    private readonly validator = new FactValidator(),
    private readonly scorer = new MemoryImportanceScorer()
  ) {}

  extract(
    episodes: EpisodicMemoryEntry[],
    context: { queryTokens: Set<string>; newestTimestamp: number }
  ): SemanticFact[] {
    const facts: SemanticFact[] = [];

    for (const episode of episodes) {
      const candidates = [
        episode.summaries.short,
        ...episode.outcomes,
        ...episode.decisions,
      ]
        .flatMap((text) => splitSentences(text))
        .map((text) => normalizeSentence(text))
        .filter((text) => this.validator.isValid(text));

      for (const candidate of candidates.slice(0, 4)) {
        const pseudoEntry: MemoryEntry = {
          id: episode.episodeId,
          sessionId: "episode",
          query: episode.objective,
          answer: candidate,
          createdAt: episode.timestamps.endedAt,
        };
        const importance = this.scorer.score(pseudoEntry, {
          newestTimestamp: context.newestTimestamp,
          duplicateCount: candidates.filter((item) => normalizeFactKey(item) === normalizeFactKey(candidate)).length,
          queryTokens: context.queryTokens,
        });
        facts.push({
          factId: `fact-${episode.episodeId}-${facts.length + 1}`,
          text: candidate,
          confidence: buildConfidence(importance.score),
          provenance: episode.linkedMemories,
          sourceEpisodes: [episode.episodeId],
          timestamps: {
            createdAt: episode.timestamps.startedAt,
            updatedAt: episode.timestamps.endedAt,
          },
          updateHistory: [`Extracted from episode ${episode.episodeId}`],
          conflictMetadata: {
            conflictsWith: [],
            status: "clear",
          },
          importance,
        });
      }
    }

    return facts;
  }
}

export class EpisodeTimeline {
  constructor(readonly episodes: EpisodicMemoryEntry[]) {}

  toJSON() {
    return this.episodes.map((episode) => ({
      episodeId: episode.episodeId,
      startedAt: episode.timestamps.startedAt,
      endedAt: episode.timestamps.endedAt,
    }));
  }
}

export class EpisodeGraph {
  constructor(readonly episodes: EpisodicMemoryEntry[], readonly edges: EpisodeGraphEdge[]) {}
}

export class EpisodeRetriever {
  retrieve(
    query: string,
    episodes: EpisodicMemoryEntry[],
    limit = DEFAULT_RETRIEVAL_LIMIT
  ): Array<{ episode: EpisodicMemoryEntry; score: number }> {
    const queryTokens = tokenize(query);

    return episodes
      .map((episode) => ({
        episode,
        score: roundScore(
          overlapScore(
            queryTokens,
            tokenize(`${episode.objective} ${episode.entities.join(" ")} ${episode.summaries.medium}`)
          ) *
            (0.6 + episode.importance.score * 0.4)
        ),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }
}

export class WorkingMemory {
  constructor(readonly state: WorkingMemoryState) {}
}

export class EpisodicMemory {
  constructor(
    readonly entries: EpisodicMemoryEntry[],
    readonly timeline: EpisodeTimeline,
    readonly graph: EpisodeGraph
  ) {}
}

export class LongTermMemory {
  constructor(readonly state: LongTermMemoryState) {}
}

export class SemanticMemory {
  constructor(readonly state: SemanticMemoryState) {}
}

export class MemoryExplainer {
  explain(query: string, text: string, score: number): string[] {
    const reasons = [`score ${(score * 100).toFixed(0)}% relevance`];
    const queryTokens = tokenize(query);
    const textTokens = tokenize(text);
    const overlap = Array.from(queryTokens).filter((token) => textTokens.has(token));

    if (overlap.length > 0) {
      reasons.push(`shared tokens: ${overlap.slice(0, 4).join(", ")}`);
    }
    if (containsAny(text, ["decision", "supports", "stores", "retrieves"])) {
      reasons.push("contains durable factual or decision-oriented content");
    }

    return reasons;
  }
}

export class FactProvenanceViewer {
  describe(fact: SemanticFact): string[] {
    return [
      `confidence ${fact.confidence.label}`,
      `episodes ${fact.sourceEpisodes.join(", ") || "n/a"}`,
      `provenance ${fact.provenance.join(", ") || "n/a"}`,
    ];
  }
}

export class MemoryRetrievalEngine {
  constructor(
    private readonly episodeRetriever = new EpisodeRetriever(),
    private readonly explainer = new MemoryExplainer()
  ) {}

  retrieve(
    query: string,
    hierarchy: MemoryHierarchySnapshot,
    limit = DEFAULT_RETRIEVAL_LIMIT,
    strategy: NonNullable<MemoryHierarchyRequest["retrievalStrategy"]> = "hybrid"
  ): MemoryRetrievalResult {
    const queryTokens = tokenize(query);
    const workingItems: Array<{ item: MemoryRetrievalResultItem; trace: MemorySelectionTrace }> =
      hierarchy.workingMemory.items.map((item) => {
        const text = `${item.query} ${item.answer}`;
        const score = roundScore(overlapScore(queryTokens, tokenize(text)) * (0.6 + item.attentionScore * 0.4));
        return {
          item: {
            memoryId: item.entryId,
            memoryType: "working",
            score,
            text: truncate(text, 240),
          },
          trace: {
            memoryId: item.entryId,
            memoryType: "working",
            score,
            reasons: this.explainer.explain(query, text, score),
          },
        };
      });

    const episodicItems = this.episodeRetriever.retrieve(query, hierarchy.episodicMemory.episodes, limit).map(
      ({ episode, score }) => ({
        item: {
          memoryId: episode.episodeId,
          memoryType: "episodic" as const,
          score,
          text: episode.summaries.medium,
          sourceEpisodeId: episode.episodeId,
        },
        trace: {
          memoryId: episode.episodeId,
          memoryType: "episodic" as const,
          score,
          reasons: this.explainer.explain(query, episode.summaries.medium, score),
        },
      })
    );

    const factItems = hierarchy.longTermMemory.facts.map((fact) => {
      const score = roundScore(
        overlapScore(queryTokens, tokenize(fact.text)) * (0.55 + fact.importance.score * 0.45)
      );
      return {
        item: {
          memoryId: fact.factId,
          memoryType: "fact" as const,
          score,
          text: fact.text,
          provenance: fact.provenance,
        },
        trace: {
          memoryId: fact.factId,
          memoryType: "fact" as const,
          score,
          reasons: [...this.explainer.explain(query, fact.text, score), ...new FactProvenanceViewer().describe(fact)],
        },
      };
    });

    const all = [
      ...(strategy === "episodic" || strategy === "fact" ? [] : workingItems),
      ...(strategy === "fact" || strategy === "recency" ? [] : episodicItems),
      ...(strategy === "episodic" ? [] : factItems),
    ]
      .filter((item) => item.item.score > 0)
      .sort((left, right) => right.item.score - left.item.score)
      .slice(0, limit);

    return {
      sessionId: hierarchy.sessionId,
      query,
      strategy,
      results: all.map((item) => item.item),
      selectionTrace: all.map((item) => item.trace),
    };
  }
}

export class MemoryCompressor {
  constructor(private readonly distiller = new MemoryDistiller()) {}

  compress(entries: MemoryEntry[]): {
    episodes: EpisodicMemoryEntry[];
    compressionRatio: number;
    summariesCreated: number;
  } {
    const groups = chunkEntries(entries, 3);
    const episodes = groups.map((group, index) => buildEpisode(group, index + 1, this.distiller));
    const totalRawTokens = Math.max(1, entries.reduce((sum, entry) => sum + estimateTokens(`${entry.query} ${entry.answer}`), 0));
    const totalSummaryTokens = Math.max(
      1,
      episodes.reduce((sum, episode) => sum + estimateTokens(episode.summaries.medium), 0)
    );

    return {
      episodes,
      compressionRatio: roundScore(1 - totalSummaryTokens / totalRawTokens),
      summariesCreated: episodes.length,
    };
  }
}

export class MemoryCompressionEngine {
  constructor(private readonly compressor = new MemoryCompressor()) {}

  run(entries: MemoryEntry[]) {
    return this.compressor.compress(entries);
  }
}

export class MemoryLifecycleManager {
  constructor(private readonly decayPolicy = new MemoryDecayPolicy()) {}

  applyDecay(
    entries: MemoryEntry[],
    workingMemory: WorkingMemoryState,
    importanceById: Map<string, MemoryImportanceScore>
  ): MemoryDecayState {
    const archivedEntryIds: string[] = [];
    const compactedEntryIds: string[] = [];

    for (const entry of entries) {
      if (workingMemory.items.some((item) => item.entryId === entry.id)) {
        continue;
      }

      const importance = importanceById.get(entry.id);
      if (!importance) {
        continue;
      }

      if (this.decayPolicy.classify(importance.score) === "archive") {
        archivedEntryIds.push(entry.id);
      } else if (this.decayPolicy.classify(importance.score) === "compact") {
        compactedEntryIds.push(entry.id);
      }
    }

    return {
      archivedEntryIds,
      compactedEntryIds,
      removedEntryIds: [],
    };
  }
}

export class MemoryConsolidator {
  constructor(
    private readonly compressionEngine = new MemoryCompressionEngine(),
    private readonly factExtractor = new FactExtractor(),
    private readonly conflictResolver = new FactConflictResolver(),
    private readonly scorer = new MemoryImportanceScorer(),
    private readonly lifecycle = new MemoryLifecycleManager()
  ) {}

  consolidate(
    sessionId: string,
    entries: MemoryEntry[],
    request: MemoryHierarchyRequest = {}
  ): {
    hierarchy: MemoryHierarchySnapshot;
    compressionRatio: number;
    summariesCreated: number;
    mergedFacts: number;
  } {
    const chronological = [...entries].sort((left, right) => left.createdAt - right.createdAt);
    const newestTimestamp = chronological.at(-1)?.createdAt ?? Date.now();
    const queryTokens = tokenize(request.query ?? chronological.at(-1)?.query ?? "");
    const duplicateCounts = buildDuplicateCounts(chronological);
    const importanceById = new Map<string, MemoryImportanceScore>(
      chronological.map((entry) => [
        entry.id,
        this.scorer.score(entry, {
          newestTimestamp,
          duplicateCount: duplicateCounts.get(normalizeFactKey(`${entry.query} ${entry.answer}`)) ?? 1,
          queryTokens,
        }),
      ])
    );

    const workingMemory = buildWorkingMemory(chronological, importanceById, request);
    const compression = this.compressionEngine.run(
      chronological.filter((entry) => !workingMemory.items.some((item) => item.entryId === entry.id))
    );
    const timeline = new EpisodeTimeline(compression.episodes);
    const graphEdges = buildEpisodeGraphEdges(compression.episodes);
    const graph = new EpisodeGraph(compression.episodes, graphEdges);
    const extractedFacts = request.factExtraction === false
      ? []
      : this.factExtractor.extract(compression.episodes, { queryTokens, newestTimestamp });
    const resolvedFacts = this.conflictResolver.resolve(extractedFacts);
    const retentionPolicy = new MemoryRetentionPolicy(
      new MemoryPriorityClassifier(),
      request.importanceThreshold ?? DEFAULT_IMPORTANCE_THRESHOLD
    );
    const retainedFacts = resolvedFacts.facts.filter((fact) => retentionPolicy.shouldPersist(fact.importance.score));
    const decay = this.lifecycle.applyDecay(chronological, workingMemory, importanceById);
    const semanticMemory = buildSemanticMemory(retainedFacts, compression.episodes);

    const traces = buildTraces({
      workingMemory,
      episodes: compression.episodes,
      facts: retainedFacts,
      mergedFacts: resolvedFacts.mergedCount,
      decay,
      compressionRatio: compression.compressionRatio,
    });

    return {
      hierarchy: {
        sessionId,
        workingMemory,
        episodicMemory: {
          episodes: compression.episodes,
          graph: graph.edges,
          timeline: timeline.toJSON(),
        },
        semanticMemory,
        longTermMemory: {
          facts: retainedFacts,
          retainedFacts: retainedFacts.length,
          archivedFacts: Math.max(0, resolvedFacts.facts.length - retainedFacts.length),
        },
        decay,
        traces,
      },
      compressionRatio: compression.compressionRatio,
      summariesCreated: compression.summariesCreated,
      mergedFacts: resolvedFacts.mergedCount,
    };
  }
}

export class MemoryHierarchy {
  constructor(readonly snapshot: MemoryHierarchySnapshot) {}
}

export class MemoryManager implements MemoryManagerContract {
  private readonly consolidator = new MemoryConsolidator();
  private readonly retrievalEngine = new MemoryRetrievalEngine();

  constructor(private readonly store: SessionMemoryStore) {}

  async getHierarchy(
    sessionId: string,
    request: MemoryHierarchyRequest = {}
  ): Promise<MemoryHierarchySnapshot> {
    const entries = await this.loadEntries(sessionId);
    return this.consolidator.consolidate(sessionId, entries, request).hierarchy;
  }

  async compress(
    sessionId: string,
    request: MemoryHierarchyRequest = {}
  ): Promise<MemoryCompressionResult> {
    const entries = await this.loadEntries(sessionId);
    const consolidated = this.consolidator.consolidate(sessionId, entries, request);

    return {
      sessionId,
      compressionMode: request.compressionMode ?? "hierarchical",
      compressionRatio: consolidated.compressionRatio,
      compressedEntries: Math.max(
        0,
        entries.length - consolidated.hierarchy.workingMemory.items.length
      ),
      summariesCreated: consolidated.summariesCreated,
      hierarchy: consolidated.hierarchy,
    };
  }

  async consolidate(
    sessionId: string,
    request: MemoryHierarchyRequest = {}
  ): Promise<MemoryConsolidationResult> {
    const entries = await this.loadEntries(sessionId);
    const consolidated = this.consolidator.consolidate(sessionId, entries, request);

    return {
      sessionId,
      consolidatedEpisodes: consolidated.hierarchy.episodicMemory.episodes.length,
      extractedFacts: consolidated.hierarchy.longTermMemory.facts.length,
      hierarchy: consolidated.hierarchy,
    };
  }

  async extractFacts(
    sessionId: string,
    request: MemoryHierarchyRequest = {}
  ): Promise<FactExtractionResult> {
    const hierarchy = await this.getHierarchy(sessionId, request);

    return {
      sessionId,
      facts: hierarchy.longTermMemory.facts,
      traces: hierarchy.traces.filter((trace) => trace.stage === "fact-extraction" || trace.stage === "semantic-consolidation"),
    };
  }

  async retrieve(
    sessionId: string,
    query: string,
    request: MemoryHierarchyRequest & { limit?: number } = {}
  ): Promise<MemoryRetrievalResult> {
    const hierarchy = await this.getHierarchy(sessionId, { ...request, query });
    return this.retrievalEngine.retrieve(
      query,
      hierarchy,
      request.limit ?? DEFAULT_RETRIEVAL_LIMIT,
      request.retrievalStrategy ?? "hybrid"
    );
  }

  protected async loadEntries(sessionId: string): Promise<MemoryEntry[]> {
    const entries = await this.store.list(sessionId, ENTRY_READ_LIMIT);
    return [...entries].sort((left, right) => left.createdAt - right.createdAt);
  }
}

export class FileMemoryManager extends MemoryManager {}

function buildWorkingMemory(
  entries: MemoryEntry[],
  importanceById: Map<string, MemoryImportanceScore>,
  request: MemoryHierarchyRequest
): WorkingMemoryState {
  const memoryWindow = Math.max(1, Math.floor(request.memoryWindow ?? DEFAULT_MEMORY_WINDOW));
  const maxTokens = Math.max(32, Math.floor(request.maxWorkingMemoryTokens ?? DEFAULT_MAX_WORKING_TOKENS));
  const recent = [...entries].sort((left, right) => right.createdAt - left.createdAt);
  const selected: WorkingMemoryItem[] = [];
  const overflow: WorkingMemoryItem[] = [];
  let estimatedTokens = 0;

  for (const entry of recent) {
    const importance = importanceById.get(entry.id);
    const entryTokens = estimateTokens(`${entry.query} ${entry.answer}`);
    const item: WorkingMemoryItem = {
      entryId: entry.id,
      query: entry.query,
      answer: entry.answer,
      createdAt: entry.createdAt,
      estimatedTokens: entryTokens,
      attentionScore: importance?.score ?? 0.4,
    };

    if (selected.length < memoryWindow && estimatedTokens + entryTokens <= maxTokens) {
      selected.push(item);
      estimatedTokens += entryTokens;
    } else {
      overflow.push(item);
    }
  }

  const selectedEntries = selected.map((item) =>
    entries.find((entry) => entry.id === item.entryId)
  ).filter((entry): entry is MemoryEntry => Boolean(entry));
  const activeEntities = extractKeywords(
    [
      ...selectedEntries.flatMap((entry) => [entry.query, entry.answer]),
      ...(request.activeEntities ?? []),
    ].join(" "),
    8
  );

  return {
    maxTokens,
    memoryWindow,
    estimatedTokens,
    compressionTriggered: overflow.length > 0,
    items: selected,
    overflow,
    activeGoals: unique([
      ...(request.currentObjectives ?? []),
      ...selectedEntries.slice(0, 2).map((entry) => normalizeSentence(entry.query)),
      ...(request.currentPlan ? [request.currentPlan] : []),
    ]).slice(0, 4),
    activeEntities,
    recentRetrievals: unique(
      selectedEntries.flatMap((entry) => normalizeListMetadata(entry.metadata?.["retrieval"]))
    ).slice(0, 4),
    recentToolOutputs: unique(
      selectedEntries.flatMap((entry) => normalizeListMetadata(entry.metadata?.["toolOutputs"]))
    ).slice(0, 4),
    temporaryEvidence: selectedEntries
      .map((entry) => normalizeSentence(firstSentence(entry.answer)))
      .slice(0, 4),
  };
}

function buildEpisode(entries: MemoryEntry[], index: number, distiller: MemoryDistiller): EpisodicMemoryEntry {
  const summaries = distiller.distill(entries);
  const objective = normalizeSentence(entries[0]?.query ?? `Episode ${index}`);
  const toolsUsed = unique(entries.flatMap((entry) => normalizeListMetadata(entry.metadata?.["tools"])));
  const entities = extractKeywords(entries.flatMap((entry) => [entry.query, entry.answer]).join(" "), 8);
  const outcomes = entries.map((entry) => normalizeSentence(firstSentence(entry.answer)));
  const failures = outcomes.filter((text) => containsAny(text, ["fail", "error", "unable", "missing"]));
  const decisions = outcomes.filter((text) =>
    containsAny(text, ["should", "will", "recommend", "supports", "stores", "retrieves"])
  );
  const timestamps = {
    startedAt: entries[0]?.createdAt ?? Date.now(),
    endedAt: entries.at(-1)?.createdAt ?? Date.now(),
  };
  const averageImportance =
    entries.reduce((sum, entry) => sum + scoreEntryForEpisode(entry), 0) / Math.max(entries.length, 1);

  return {
    episodeId: `episode-${index}`,
    objective,
    actions: entries.map((entry) => normalizeSentence(entry.query)),
    toolsUsed,
    entities,
    outcomes,
    failures,
    decisions,
    summaries,
    timestamps,
    embeddings: buildPseudoEmbedding(`${objective} ${summaries.medium}`),
    linkedMemories: entries.map((entry) => entry.id),
    importance: {
      score: roundScore(averageImportance),
      classification: new MemoryPriorityClassifier().classify(averageImportance),
      signals: {
        frequency: roundScore(clamp01(entries.length / 3)),
        recency: 0.6,
        taskImpact: 0.8,
        explicitPreference: 0,
        factuality: 0.7,
        emotionalSalience: 0.05,
        planningRelevance: 0.6,
        retrievalUsefulness: 0.7,
        userCorrection: decisions.some((decision) => containsAny(decision, ["update", "correct"])) ? 0.8 : 0,
        futureUtility: 0.65,
      },
    },
  };
}

function buildEpisodeGraphEdges(episodes: EpisodicMemoryEntry[]): EpisodeGraphEdge[] {
  const edges: EpisodeGraphEdge[] = [];

  for (let index = 0; index < episodes.length; index += 1) {
    const current = episodes[index];
    const next = episodes[index + 1];

    if (!current || !next) {
      continue;
    }

    edges.push({
      fromEpisodeId: current.episodeId,
      toEpisodeId: next.episodeId,
      relation: "temporal",
    });

    if (current.entities.some((entity) => next.entities.includes(entity))) {
      edges.push({
        fromEpisodeId: current.episodeId,
        toEpisodeId: next.episodeId,
        relation: "entity-overlap",
      });
    }

    if (tokenize(current.objective).size > 0 && overlapScore(tokenize(current.objective), tokenize(next.objective)) > 0) {
      edges.push({
        fromEpisodeId: current.episodeId,
        toEpisodeId: next.episodeId,
        relation: "objective-overlap",
      });
    }
  }

  return edges;
}

function buildSemanticMemory(
  facts: SemanticFact[],
  episodes: EpisodicMemoryEntry[]
): SemanticMemoryState {
  const concepts = new Map<string, { relatedFacts: Set<string>; relatedEpisodes: Set<string> }>();

  for (const fact of facts) {
    for (const concept of extractKeywords(fact.text, 4)) {
      const existing = concepts.get(concept) ?? {
        relatedFacts: new Set<string>(),
        relatedEpisodes: new Set<string>(),
      };
      existing.relatedFacts.add(fact.factId);
      for (const episodeId of fact.sourceEpisodes) {
        existing.relatedEpisodes.add(episodeId);
      }
      concepts.set(concept, existing);
    }
  }

  for (const episode of episodes) {
    for (const entity of episode.entities.slice(0, 4)) {
      const existing = concepts.get(entity) ?? {
        relatedFacts: new Set<string>(),
        relatedEpisodes: new Set<string>(),
      };
      existing.relatedEpisodes.add(episode.episodeId);
      concepts.set(entity, existing);
    }
  }

  return {
    facts,
    conceptIndex: Array.from(concepts.entries()).map(([concept, links]) => ({
      concept,
      relatedFacts: Array.from(links.relatedFacts),
      relatedEpisodes: Array.from(links.relatedEpisodes),
    })),
  };
}

function buildTraces(input: {
  workingMemory: WorkingMemoryState;
  episodes: EpisodicMemoryEntry[];
  facts: SemanticFact[];
  mergedFacts: number;
  decay: MemoryDecayState;
  compressionRatio: number;
}): CompressionTrace[] {
  const timestamp = Date.now();
  const traces: CompressionTrace[] = [
    {
      traceId: "trace-working-memory",
      stage: "working-memory",
      summary: input.workingMemory.compressionTriggered
        ? "working memory exceeded threshold"
        : "working memory within threshold",
      timestamp,
      metrics: {
        workingItems: input.workingMemory.items.length,
        overflowItems: input.workingMemory.overflow.length,
        estimatedTokens: input.workingMemory.estimatedTokens,
      },
    },
  ];

  if (input.workingMemory.compressionTriggered) {
    traces.push({
      traceId: "trace-compression",
      stage: "compression",
      summary: "compression triggered",
      timestamp,
      metrics: {
        compressionRatio: input.compressionRatio,
        summariesCreated: input.episodes.length,
      },
    });
  }

  traces.push(
    {
      traceId: "trace-episodic",
      stage: "episodic",
      summary: `${input.episodes.length} episodic summaries created`,
      timestamp,
      metrics: {
        episodes: input.episodes.length,
      },
    },
    {
      traceId: "trace-facts",
      stage: "fact-extraction",
      summary: `${input.facts.length} semantic facts extracted`,
      timestamp,
      metrics: {
        facts: input.facts.length,
      },
    },
    {
      traceId: "trace-semantic",
      stage: "semantic-consolidation",
      summary: `${input.mergedFacts} redundant memories merged`,
      timestamp,
      metrics: {
        mergedFacts: input.mergedFacts,
      },
    },
    {
      traceId: "trace-decay",
      stage: "decay",
      summary: `${input.decay.archivedEntryIds.length} memories archived`,
      timestamp,
      metrics: {
        archived: input.decay.archivedEntryIds.length,
        compacted: input.decay.compactedEntryIds.length,
      },
    }
  );

  return traces;
}

function buildConfidence(score: number): FactConfidence {
  if (score >= 0.8) {
    return { score: roundScore(score), label: "high" };
  }
  if (score >= 0.5) {
    return { score: roundScore(score), label: "medium" };
  }
  return { score: roundScore(score), label: "low" };
}

function mergeConfidence(confidences: FactConfidence[]): FactConfidence {
  const average = confidences.reduce((sum, item) => sum + item.score, 0) / Math.max(confidences.length, 1);
  return buildConfidence(average);
}

function buildDuplicateCounts(entries: MemoryEntry[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    const key = normalizeFactKey(`${entry.query} ${entry.answer}`);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function chunkEntries(entries: MemoryEntry[], size: number): MemoryEntry[][] {
  if (entries.length === 0) {
    return [];
  }

  const chunks: MemoryEntry[][] = [];

  for (let index = 0; index < entries.length; index += size) {
    chunks.push(entries.slice(index, index + size));
  }

  return chunks;
}

function normalizeListMetadata(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return [value];
  }
  return [];
}

function isTruthyMetadata(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function containsFactualCue(text: string): boolean {
  return /\b(is|are|uses|supports|stores|retrieves|exists|implemented|keeps)\b/i.test(text);
}

function containsAny(text: string, cues: string[]): boolean {
  const normalized = text.toLowerCase();
  return cues.some((cue) => normalized.includes(cue));
}

function scoreEntryForEpisode(entry: MemoryEntry): number {
  let score = 0.45;
  if (containsAny(entry.query, ["plan", "fix", "support", "memory", "episode"])) {
    score += 0.2;
  }
  if (containsFactualCue(entry.answer)) {
    score += 0.2;
  }
  if (containsAny(entry.answer, ["fail", "error", "decision", "recommend"])) {
    score += 0.1;
  }
  return clamp01(score);
}

function buildPseudoEmbedding(text: string): number[] {
  const vector = Array.from({ length: 8 }, () => 0);
  for (const token of tokenize(text)) {
    let hash = 0;
    for (const char of token) {
      hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }
    vector[hash % vector.length] += 1;
  }
  return vector.map((value) => roundScore(value / Math.max(1, Math.max(...vector))));
}

function tokenize(input: string): Set<string> {
  const values = input.normalize("NFKC").toLowerCase().match(/[a-z0-9]+/g);
  return new Set((values ?? []).filter((token) => !STOP_WORDS.has(token)));
}

function overlapScore(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) {
      overlap += 1;
    }
  }

  return overlap / left.size;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function firstSentence(text: string): string {
  return splitSentences(text)[0] ?? text.trim();
}

function normalizeSentence(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function extractKeywords(text: string, limit: number): string[] {
  const counts = new Map<string, number>();
  for (const token of tokenize(text)) {
    if (token.length < 4) {
      continue;
    }
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([token]) => token);
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.3));
}

function normalizeFactKey(text: string): string {
  return normalizeSentence(text).toLowerCase();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function roundScore(value: number): number {
  return Number(value.toFixed(4));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
