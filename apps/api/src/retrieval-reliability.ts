import { createHash, randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { resolve } from "path";

export type RetrievalFailureCategory =
  | "NOT_FOUND"
  | "WRONG_CONTEXT"
  | "PARTIAL_CONTEXT"
  | "UNGROUNDED_ANSWER"
  | "LOW_CONFIDENCE";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "UNRELIABLE";

export interface RetrievalEvidenceChunk {
  chunkId: string;
  documentId: string;
  sectionId: string;
  score: number;
  text: string;
}

export interface RetrievalDiagnostics {
  resultCount: number;
  candidateCount: number;
  returnedCount: number;
  topScore: number;
  avgScore: number;
  scoreSpread: number;
  sourceDiversity: number;
  citationCount: number;
  citationCoverage: number;
  evidenceCoverage: number;
  groundedConsistency: number;
  conflictCount: number;
  conflictingChunkIds: string[];
  involvedChunkIds: string[];
  retrievalMetadata: {
    retrievalMode: string;
    rerankingApplied: boolean;
    provider?: string;
    model?: string;
    queryIntent?: string;
  };
}

export interface RetrievalFailureClassification {
  category: RetrievalFailureCategory;
  confidence: number;
  probableCause: string;
  involvedChunks: string[];
  retrievalMetadata: RetrievalDiagnostics["retrievalMetadata"] & {
    topScore: number;
    avgScore: number;
    sourceDiversity: number;
    evidenceCoverage: number;
    groundedConsistency: number;
    conflictCount: number;
  };
}

export interface ConfidenceCalibration {
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  confidenceReasoning: string[];
  factors: {
    retrievalScore: number;
    sourceDiversity: number;
    groundedness: number;
    questionCoverage: number;
    evidenceQuantity: number;
    answerConsistency: number;
    conflictPenalty: number;
  };
}

export interface ReplaySnapshot {
  version: "v1";
  capturedAt: string;
  mode: "inline" | "persisted";
  query: string;
  correlation: {
    requestId?: string;
    sessionId?: string;
    traceId?: string;
  };
  document: {
    documentId: string;
    title?: string;
    checksum?: string;
    persisted: boolean;
    indexPath?: string;
    originalFilename?: string;
  };
  indexRef: {
    indexId: string;
    indexVersion?: string;
    snapshotId?: string;
  };
  parameters: {
    topK: number;
    reasoningEnabled: boolean;
    useMultiModelOrchestration: boolean;
    enableShadowRetrieval: boolean;
  };
  retrievalConfig: {
    mode: string;
    candidateCount: number;
    returnedCount: number;
    rerankingApplied: boolean;
  };
  providers: {
    embeddingProvider: string;
    embeddingModel?: string;
    selectedModel?: string;
    selectedProvider?: string;
  };
  generation: {
    strategy: "extractive-grounded";
    deterministic: boolean;
    config: {
      temperature: 0;
      topP: 1;
      maxTokens?: number;
    };
  };
  prompts: {
    systemPrompt: string;
    answerPolicy: string;
  };
  policies: {
    groundingPolicy: string;
    refusalPolicy: string;
    citationPolicy: string;
  };
  chunks: Array<{
    chunkId: string;
    sectionId: string;
    rank: number;
    score: number;
    text: string;
    textHash: string;
    textPreview: string;
  }>;
  rerankingConfig: {
    applied: boolean;
    candidateCount: number;
    returnedCount: number;
  };
  reranking: Array<{
    chunkId: string;
    beforeRank: number;
    afterRank: number;
    finalScore: number;
  }>;
  original: {
    answer: {
      text: string;
      grounded: boolean;
      citations: Array<{
        chunkId: string;
        documentId: string;
        sectionId: string;
      }>;
    };
    costUsd?: number;
    latencyMs?: number;
    groundedness?: number;
  };
  environment: {
    runtime: "node";
    nodeVersion: string;
    platform: NodeJS.Platform;
    nodeEnv?: string;
  };
}

export interface ReplayComparisonReport {
  version: "v1";
  replayId: string;
  originalTraceId?: string;
  createdAt: string;
  status: "matched" | "diverged" | "error";
  original: ReplaySnapshot;
  replay: ReplaySnapshot;
  differences: {
    responseChanged: boolean;
    retrievalChanged: boolean;
    chunkOrderChanged: boolean;
    scoresChanged: boolean;
    groundednessChanged: boolean;
    modelChanged: boolean;
    providerChanged: boolean;
    embeddingProviderChanged: boolean;
    costDeltaUsd: number;
    latencyDeltaMs: number;
    addedChunkIds: string[];
    removedChunkIds: string[];
    reorderedChunkIds: string[];
    scoreDeltas: Array<{
      chunkId: string;
      originalScore?: number;
      replayScore?: number;
      delta?: number;
    }>;
  };
  errors: string[];
  summary: string[];
}

export interface CorpusDriftQuerySnapshot {
  id: string;
  question: string;
  expectedChunkIds: string[];
  retrievedChunkIds: string[];
  recallAtK: number;
  rankOfExpected: number | null;
  topScore: number;
}

export interface CorpusDriftSnapshot {
  version: "v1";
  createdAt: string;
  dataset: string;
  topK: number;
  queries: CorpusDriftQuerySnapshot[];
}

export interface CorpusDriftReport {
  version: "v1";
  createdAt: string;
  dataset: string;
  baselineCreatedAt?: string;
  currentCreatedAt: string;
  summary: {
    degraded: boolean;
    queriesEvaluated: number;
    regressions: number;
    improvements: number;
    missingRelevantChunks: number;
  };
  queries: Array<{
    id: string;
    question: string;
    recallPrevious: number;
    recallCurrent: number;
    difference: number;
    rankPrevious: number | null;
    rankCurrent: number | null;
    missingRelevantChunks: string[];
    possibleResponsibleDocuments: string[];
    timestamp: string;
    status: "regressed" | "improved" | "stable";
  }>;
}

export interface PromptPolicyVariantRun {
  variant: string;
  description: string;
  metrics: {
    sampleSize: number;
    avgFaithfulness: number;
    avgRelevance: number;
    avgRecall: number;
    avgQuality: number;
    avgGroundedness?: number;
    avgLatencyMs?: number;
    avgCostUsd?: number;
    refusalRate?: number;
    stability?: number;
  };
  perQuery: Array<{
    id: string;
    question: string;
    answer: string;
    retrievedChunkIds: string[];
    scores: {
      faithfulness: number;
      relevance: number;
      recall: number;
      quality: number;
      groundedness?: number;
    };
    latencyMs?: number;
    costUsd?: number;
    refused?: boolean;
  }>;
}

export interface PromptPolicyDiffReport {
  version: "v1";
  createdAt: string;
  dataset: string;
  comparedVariants: string[];
  winner: string;
  regressions: string[];
  improvements: string[];
  metricsComparison: Array<{
    variant: string;
    avgQuality: number;
    avgGroundedness: number;
    avgRecall: number;
    avgLatencyMs: number;
    avgCostUsd: number;
    refusalRate: number;
    stability: number;
  }>;
  relevantDifferences: Array<{
    queryId: string;
    question: string;
    changed: boolean;
    winningVariant: string;
    comparedAgainst: string;
  }>;
}

export interface ReliabilityReportSummaries {
  drift?: {
    degraded: boolean;
    regressions: number;
    affectedQueries: string[];
    generatedAt: string;
  };
  diff?: {
    winner: string;
    regressions: number;
    improvements: number;
    generatedAt: string;
  };
}

export function buildRetrievalDiagnostics(input: {
  results: RetrievalEvidenceChunk[];
  candidateCount?: number;
  citations?: Array<{ chunkId: string }>;
  evals?: {
    groundedness?: number;
    answerOverlap?: number;
  };
  retrievalMode?: string;
  rerankingApplied?: boolean;
  provider?: string;
  model?: string;
  queryIntent?: string;
}): RetrievalDiagnostics {
  const scores = input.results.map((item) => item.score);
  const topScore = scores[0] ?? 0;
  const avgScore =
    scores.length === 0 ? 0 : scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const minScore = scores.length === 0 ? 0 : Math.min(...scores);
  const citationIds = new Set((input.citations ?? []).map((item) => item.chunkId));
  const sourcePairs = new Set(input.results.map((item) => `${item.documentId}:${item.sectionId}`));
  const involvedChunkIds = input.results.map((item) => item.chunkId);
  const conflictingChunkIds = detectConflictingChunks(input.results);
  const citationCoverage =
    citationIds.size === 0
      ? 0
      : involvedChunkIds.filter((chunkId) => citationIds.has(chunkId)).length / Math.max(1, citationIds.size);
  const evidenceCoverage = Number(
    (
      ((input.evals?.answerOverlap ?? 0) * 0.55 + normalizeScore(avgScore) * 0.45)
    ).toFixed(3)
  );
  const groundedConsistency = Number(
    (
      ((input.evals?.groundedness ?? 0) * 0.65 + citationCoverage * 0.35)
    ).toFixed(3)
  );

  return {
    resultCount: input.results.length,
    candidateCount: input.candidateCount ?? input.results.length,
    returnedCount: input.results.length,
    topScore: round(topScore, 3),
    avgScore: round(avgScore, 3),
    scoreSpread: round(Math.max(0, topScore - minScore), 3),
    sourceDiversity: sourcePairs.size,
    citationCount: citationIds.size,
    citationCoverage: round(citationCoverage, 3),
    evidenceCoverage,
    groundedConsistency,
    conflictCount: conflictingChunkIds.length,
    conflictingChunkIds,
    involvedChunkIds,
    retrievalMetadata: {
      retrievalMode: input.retrievalMode ?? "unknown",
      rerankingApplied: Boolean(input.rerankingApplied),
      provider: input.provider,
      model: input.model,
      queryIntent: input.queryIntent,
    },
  };
}

export function classifyRetrievalFailure(input: {
  diagnostics: RetrievalDiagnostics;
  answerGrounded: boolean;
  answerText: string;
  evals?: {
    groundedness?: number;
    answerOverlap?: number;
    retrievalAccuracy?: number;
    scorerResults?: {
      faithfulness?: { score: number };
      relevance?: { score: number };
      recall?: { score: number };
    };
  };
}): RetrievalFailureClassification {
  const groundedness = input.evals?.groundedness ?? 0;
  const answerOverlap = input.evals?.answerOverlap ?? 0;
  const retrievalAccuracy = input.evals?.retrievalAccuracy ?? 0;
  const faithfulness = input.evals?.scorerResults?.faithfulness?.score ?? groundedness;
  const recall = input.evals?.scorerResults?.recall?.score ?? retrievalAccuracy;
  const resultCount = input.diagnostics.resultCount;

  let category: RetrievalFailureCategory;
  let probableCause: string;

  if (resultCount === 0 || input.diagnostics.topScore < 0.12) {
    category = "NOT_FOUND";
    probableCause = "Retrieval returned no sufficiently relevant chunk for the question.";
  } else if (!input.answerGrounded || groundedness < 0.45 || faithfulness < 0.45) {
    category = "UNGROUNDED_ANSWER";
    probableCause = "The final answer extrapolated beyond the evidence recovered by retrieval.";
  } else if (recall < 0.45 || input.diagnostics.evidenceCoverage < 0.45) {
    category = "PARTIAL_CONTEXT";
    probableCause = "Only part of the necessary supporting evidence was retrieved.";
  } else if (input.diagnostics.conflictCount > 0 || input.diagnostics.groundedConsistency < 0.55) {
    category = "LOW_CONFIDENCE";
    probableCause = "The retrieved evidence is conflicting or too weak to support a stable answer.";
  } else if (answerOverlap < 0.35 || retrievalAccuracy < 0.35) {
    category = "WRONG_CONTEXT";
    probableCause = "Retrieval produced context, but it appears mismatched with the question or answer.";
  } else {
    category = "LOW_CONFIDENCE";
    probableCause = "The answer is grounded but remains fragile due to limited evidence breadth.";
  }

  return {
    category,
    confidence: round(
      Math.max(
        0.2,
        Math.min(
          0.98,
          input.diagnostics.topScore * 0.35 +
            groundedness * 0.25 +
            input.diagnostics.evidenceCoverage * 0.2 +
            (1 - Math.min(1, input.diagnostics.conflictCount / 3)) * 0.2
        )
      ),
      3
    ),
    probableCause,
    involvedChunks:
      input.diagnostics.conflictingChunkIds.length > 0
        ? input.diagnostics.conflictingChunkIds
        : input.diagnostics.involvedChunkIds.slice(0, 3),
    retrievalMetadata: {
      ...input.diagnostics.retrievalMetadata,
      topScore: input.diagnostics.topScore,
      avgScore: input.diagnostics.avgScore,
      sourceDiversity: input.diagnostics.sourceDiversity,
      evidenceCoverage: input.diagnostics.evidenceCoverage,
      groundedConsistency: input.diagnostics.groundedConsistency,
      conflictCount: input.diagnostics.conflictCount,
    },
  };
}

export function calibrateConfidence(input: {
  diagnostics: RetrievalDiagnostics;
  evals?: {
    groundedness?: number;
    answerOverlap?: number;
    retrievalAccuracy?: number;
    scorerResults?: {
      faithfulness?: { score: number };
      relevance?: { score: number };
      recall?: { score: number };
    };
  };
}): ConfidenceCalibration {
  const groundedness = input.evals?.groundedness ?? 0;
  const answerConsistency =
    input.evals?.scorerResults?.faithfulness?.score ?? groundedness;
  const questionCoverage =
    input.evals?.answerOverlap ??
    input.evals?.scorerResults?.relevance?.score ??
    input.diagnostics.evidenceCoverage;
  const retrievalScore =
    normalizeScore(input.diagnostics.topScore) * 0.6 +
    normalizeScore(input.diagnostics.avgScore) * 0.4;
  const sourceDiversity = Math.min(1, input.diagnostics.sourceDiversity / 3);
  const evidenceQuantity = Math.min(1, input.diagnostics.resultCount / 3);
  const conflictPenalty = Math.min(1, input.diagnostics.conflictCount / 3);
  const confidenceScore = round(
    Math.max(
      0,
      Math.min(
        1,
        retrievalScore * 0.22 +
          sourceDiversity * 0.1 +
          groundedness * 0.2 +
          questionCoverage * 0.16 +
          evidenceQuantity * 0.1 +
          answerConsistency * 0.16 +
          input.diagnostics.citationCoverage * 0.1 -
          conflictPenalty * 0.18
      )
    ),
    3
  );

  const confidenceLevel: ConfidenceLevel =
    confidenceScore >= 0.8
      ? "HIGH"
      : confidenceScore >= 0.6
        ? "MEDIUM"
        : confidenceScore >= 0.4
          ? "LOW"
          : "UNRELIABLE";

  const confidenceReasoning = [
    `retrieval score=${round(retrievalScore, 3)}`,
    `coverage=${round(questionCoverage, 3)}`,
    `groundedness=${round(groundedness, 3)}`,
    `source diversity=${input.diagnostics.sourceDiversity}`,
    `conflicts=${input.diagnostics.conflictCount}`,
  ];

  return {
    confidenceScore,
    confidenceLevel,
    confidenceReasoning,
    factors: {
      retrievalScore: round(retrievalScore, 3),
      sourceDiversity: round(sourceDiversity, 3),
      groundedness: round(groundedness, 3),
      questionCoverage: round(questionCoverage, 3),
      evidenceQuantity: round(evidenceQuantity, 3),
      answerConsistency: round(answerConsistency, 3),
      conflictPenalty: round(conflictPenalty, 3),
    },
  };
}

export function buildReplaySnapshot(input: {
  query: string;
  correlation?: ReplaySnapshot["correlation"];
  document: {
    documentId: string;
    title?: string;
    checksum?: string;
    persisted: boolean;
    indexPath?: string;
    originalFilename?: string;
  };
  indexRef?: ReplaySnapshot["indexRef"];
  parameters: ReplaySnapshot["parameters"];
  retrievalConfig: ReplaySnapshot["retrievalConfig"];
  providers: ReplaySnapshot["providers"];
  results: Array<{
    chunkId: string;
    sectionId: string;
    rank: number;
    score: number;
    text: string;
  }>;
  generation?: ReplaySnapshot["generation"];
  rerankingConfig?: ReplaySnapshot["rerankingConfig"];
  reranking?: ReplaySnapshot["reranking"];
  original?: ReplaySnapshot["original"];
  environment?: ReplaySnapshot["environment"];
}): ReplaySnapshot {
  return {
    version: "v1",
    capturedAt: new Date().toISOString(),
    mode: input.document.persisted ? "persisted" : "inline",
    query: input.query,
    correlation: input.correlation ?? {},
    document: input.document,
    indexRef: input.indexRef ?? {
      indexId: input.document.documentId,
    },
    parameters: input.parameters,
    retrievalConfig: input.retrievalConfig,
    providers: input.providers,
    generation: input.generation ?? {
      strategy: "extractive-grounded",
      deterministic: true,
      config: {
        temperature: 0,
        topP: 1,
      },
    },
    prompts: {
      systemPrompt:
        "Answer only from retrieved evidence. Preserve grounding. Do not invent missing facts.",
      answerPolicy:
        "Prefer extractive grounded answers, cite retrieved chunks, and degrade confidence when evidence is weak.",
    },
    policies: {
      groundingPolicy: "support answer claims with retrieved chunks only",
      refusalPolicy: "when evidence is insufficient, keep confidence low and avoid fabricated certainty",
      citationPolicy: "carry chunk identifiers and section metadata into the answer trace",
    },
    chunks: input.results.map((result) => ({
      chunkId: result.chunkId,
      sectionId: result.sectionId,
      rank: result.rank,
      score: round(result.score, 3),
      text: result.text,
      textHash: createHash("sha256").update(result.text).digest("hex"),
      textPreview: result.text.slice(0, 140),
    })),
    rerankingConfig: input.rerankingConfig ?? {
      applied: (input.reranking ?? []).length > 0,
      candidateCount: input.retrievalConfig.candidateCount,
      returnedCount: input.retrievalConfig.returnedCount,
    },
    reranking: input.reranking ?? [],
    original: input.original ?? {
      answer: {
        text: "",
        grounded: false,
        citations: [],
      },
    },
    environment: input.environment ?? {
      runtime: "node",
      nodeVersion: process.version,
      platform: process.platform,
      nodeEnv: process.env.NODE_ENV,
    },
  };
}

export function compareReplaySnapshots(input: {
  original: ReplaySnapshot;
  replay: ReplaySnapshot;
  originalAnswer: { text: string; grounded: boolean };
  replayAnswer: { text: string; grounded: boolean };
  originalCostUsd?: number;
  replayCostUsd?: number;
  originalLatencyMs?: number;
  replayLatencyMs?: number;
}): ReplayComparisonReport {
  const originalChunkIds = new Set(input.original.chunks.map((item) => item.chunkId));
  const replayChunkIds = new Set(input.replay.chunks.map((item) => item.chunkId));
  const addedChunkIds = [...replayChunkIds].filter((item) => !originalChunkIds.has(item));
  const removedChunkIds = [...originalChunkIds].filter((item) => !replayChunkIds.has(item));
  const reorderedChunkIds = input.original.chunks
    .filter((item) => input.replay.chunks.some((replayItem) => replayItem.chunkId === item.chunkId))
    .filter((item) => {
      const replayItem = input.replay.chunks.find((candidate) => candidate.chunkId === item.chunkId);
      return replayItem?.rank !== item.rank;
    })
    .map((item) => item.chunkId);
  const scoreDeltas = input.original.chunks
    .filter((item) => input.replay.chunks.some((replayItem) => replayItem.chunkId === item.chunkId))
    .map((item) => {
      const replayItem = input.replay.chunks.find((candidate) => candidate.chunkId === item.chunkId);
      const originalScore = item.score;
      const replayScore = replayItem?.score;
      return {
        chunkId: item.chunkId,
        originalScore,
        replayScore,
        delta:
          typeof replayScore === "number"
            ? round(replayScore - originalScore, 3)
            : undefined,
      };
    })
    .filter((item) => item.delta !== 0);
  const retrievalChanged =
    addedChunkIds.length > 0 ||
    removedChunkIds.length > 0 ||
    reorderedChunkIds.length > 0 ||
    scoreDeltas.length > 0 ||
    JSON.stringify(input.original.reranking) !== JSON.stringify(input.replay.reranking);
  const responseChanged = normalizeWhitespace(input.originalAnswer.text) !== normalizeWhitespace(input.replayAnswer.text);
  const groundednessChanged = input.originalAnswer.grounded !== input.replayAnswer.grounded;
  const modelChanged = input.original.providers.selectedModel !== input.replay.providers.selectedModel;
  const providerChanged = input.original.providers.selectedProvider !== input.replay.providers.selectedProvider;
  const embeddingProviderChanged =
    input.original.providers.embeddingProvider !== input.replay.providers.embeddingProvider;
  const scoresChanged = scoreDeltas.length > 0;
  const chunkOrderChanged = reorderedChunkIds.length > 0;
  const errors: string[] = [];
  const status: ReplayComparisonReport["status"] =
    responseChanged ||
    retrievalChanged ||
    groundednessChanged ||
    modelChanged ||
    providerChanged ||
    embeddingProviderChanged
      ? "diverged"
      : "matched";

  const summary = [
    responseChanged ? "Answer text changed between original and replay." : "Answer text remained stable.",
    retrievalChanged ? "Retrieved evidence changed." : "Retrieved evidence remained stable.",
    groundednessChanged ? "Groundedness changed." : "Groundedness remained stable.",
    chunkOrderChanged ? "Chunk order changed." : "Chunk order remained stable.",
    scoresChanged ? "Chunk scores changed." : "Chunk scores remained stable.",
  ];
  if (modelChanged) {
    summary.push("Selected model changed.");
  }
  if (providerChanged || embeddingProviderChanged) {
    summary.push("Provider selection changed.");
  }

  return {
    version: "v1",
    replayId: randomUUID(),
    originalTraceId: input.original.correlation.traceId,
    createdAt: new Date().toISOString(),
    status,
    original: input.original,
    replay: input.replay,
    differences: {
      responseChanged,
      retrievalChanged,
      chunkOrderChanged,
      scoresChanged,
      groundednessChanged,
      modelChanged,
      providerChanged,
      embeddingProviderChanged,
      costDeltaUsd: round((input.replayCostUsd ?? 0) - (input.originalCostUsd ?? 0), 6),
      latencyDeltaMs: round((input.replayLatencyMs ?? 0) - (input.originalLatencyMs ?? 0), 3),
      addedChunkIds,
      removedChunkIds,
      reorderedChunkIds,
      scoreDeltas,
    },
    errors,
    summary,
  };
}

export function assertReplaySnapshotComplete(snapshot: ReplaySnapshot): void {
  if (!snapshot.query.trim()) {
    throw new Error("Replay snapshot is incomplete: missing original query.");
  }

  if (!snapshot.document.documentId.trim()) {
    throw new Error("Replay snapshot is incomplete: missing document identifier.");
  }

  if (snapshot.parameters.topK <= 0) {
    throw new Error("Replay snapshot is incomplete: topK must be a positive integer.");
  }

  if (snapshot.mode === "inline" && !snapshot.document.indexPath) {
    throw new Error(
      "Replay snapshot is incomplete: inline replay requires the original content file path or a persisted index."
    );
  }
}

export function createCorpusDriftReport(input: {
  dataset: string;
  previous?: CorpusDriftSnapshot;
  current: CorpusDriftSnapshot;
}): CorpusDriftReport {
  const previousMap = new Map((input.previous?.queries ?? []).map((query) => [query.id, query]));
  const queries = input.current.queries.map((query) => {
    const previous = previousMap.get(query.id);
    const recallPrevious = previous?.recallAtK ?? query.recallAtK;
    const rankPrevious = previous?.rankOfExpected ?? null;
    const difference = round(query.recallAtK - recallPrevious, 3);
    const missingRelevantChunks = query.expectedChunkIds.filter(
      (chunkId) => !query.retrievedChunkIds.includes(chunkId)
    );
    const status: "regressed" | "improved" | "stable" =
      difference < 0 || (rankPrevious !== null && query.rankOfExpected !== null && query.rankOfExpected > rankPrevious)
        ? "regressed"
        : difference > 0 ||
            (rankPrevious !== null && query.rankOfExpected !== null && query.rankOfExpected < rankPrevious)
          ? "improved"
          : "stable";

    return {
      id: query.id,
      question: query.question,
      recallPrevious,
      recallCurrent: query.recallAtK,
      difference,
      rankPrevious,
      rankCurrent: query.rankOfExpected,
      missingRelevantChunks,
      possibleResponsibleDocuments: missingRelevantChunks.map((chunkId) => chunkId.split(":")[0] ?? chunkId),
      timestamp: input.current.createdAt,
      status,
    };
  });

  const regressions = queries.filter((query) => query.status === "regressed").length;
  const improvements = queries.filter((query) => query.status === "improved").length;

  return {
    version: "v1",
    createdAt: new Date().toISOString(),
    dataset: input.dataset,
    baselineCreatedAt: input.previous?.createdAt,
    currentCreatedAt: input.current.createdAt,
    summary: {
      degraded: regressions > 0,
      queriesEvaluated: queries.length,
      regressions,
      improvements,
      missingRelevantChunks: queries.reduce((sum, query) => sum + query.missingRelevantChunks.length, 0),
    },
    queries,
  };
}

export function createPromptPolicyDiffReport(input: {
  dataset: string;
  runs: PromptPolicyVariantRun[];
}): PromptPolicyDiffReport {
  const ranked = [...input.runs].sort((left, right) => right.metrics.avgQuality - left.metrics.avgQuality);
  const winner = ranked[0];
  const baseline = ranked[1] ?? ranked[0];
  const regressions: string[] = [];
  const improvements: string[] = [];

  for (const run of input.runs) {
    if (!winner || run.variant === winner.variant) {
      continue;
    }

    if ((run.metrics.avgGroundedness ?? 0) < (winner.metrics.avgGroundedness ?? 0)) {
      regressions.push(`${run.variant} has lower groundedness than ${winner.variant}.`);
    }
    if (run.metrics.avgRecall < winner.metrics.avgRecall) {
      regressions.push(`${run.variant} has lower recall than ${winner.variant}.`);
    }
    if ((run.metrics.avgLatencyMs ?? 0) < (winner.metrics.avgLatencyMs ?? 0)) {
      improvements.push(`${run.variant} is faster than ${winner.variant}.`);
    }
    if ((run.metrics.refusalRate ?? 0) < (winner.metrics.refusalRate ?? 0)) {
      improvements.push(`${run.variant} refuses less often than ${winner.variant}.`);
    }
  }

  const relevantDifferences = (winner?.perQuery ?? []).map((query) => {
    const baselineQuery = baseline?.perQuery.find((item) => item.id === query.id);
    return {
      queryId: query.id,
      question: query.question,
      changed: normalizeWhitespace(query.answer) !== normalizeWhitespace(baselineQuery?.answer ?? ""),
      winningVariant: winner?.variant ?? "n/a",
      comparedAgainst: baseline?.variant ?? "n/a",
    };
  });

  return {
    version: "v1",
    createdAt: new Date().toISOString(),
    dataset: input.dataset,
    comparedVariants: input.runs.map((run) => run.variant),
    winner: winner?.variant ?? "n/a",
    regressions,
    improvements,
    metricsComparison: input.runs.map((run) => ({
      variant: run.variant,
      avgQuality: round(run.metrics.avgQuality, 4),
      avgGroundedness: round(run.metrics.avgGroundedness ?? 0, 4),
      avgRecall: round(run.metrics.avgRecall, 4),
      avgLatencyMs: round(run.metrics.avgLatencyMs ?? 0, 4),
      avgCostUsd: round(run.metrics.avgCostUsd ?? 0, 6),
      refusalRate: round(run.metrics.refusalRate ?? 0, 4),
      stability: round(run.metrics.stability ?? 0, 4),
    })),
    relevantDifferences,
  };
}

export async function loadReliabilityReportSummaries(
  repoRoot = process.cwd()
): Promise<ReliabilityReportSummaries> {
  const drift = await tryReadJson<CorpusDriftReport>(
    resolve(repoRoot, "datasets/golden/baselines/retrieval-drift-report.json")
  );
  const diff = await tryReadJson<PromptPolicyDiffReport>(
    resolve(repoRoot, "datasets/golden/baselines/prompt-policy-diff-report.json")
  );

  return {
    drift: drift
      ? {
          degraded: drift.summary.degraded,
          regressions: drift.summary.regressions,
          affectedQueries: drift.queries.filter((query) => query.status === "regressed").map((query) => query.id),
          generatedAt: drift.createdAt,
        }
      : undefined,
    diff: diff
      ? {
          winner: diff.winner,
          regressions: diff.regressions.length,
          improvements: diff.improvements.length,
          generatedAt: diff.createdAt,
        }
      : undefined,
  };
}

function detectConflictingChunks(results: RetrievalEvidenceChunk[]): string[] {
  const normalized = new Map<string, string[]>();
  for (const result of results) {
    const key = result.text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const bucket = normalized.get(key) ?? [];
    bucket.push(result.chunkId);
    normalized.set(key, bucket);
  }

  return [...normalized.values()].filter((bucket) => bucket.length > 1).flat();
}

function normalizeScore(score: number): number {
  if (!Number.isFinite(score) || score <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, score));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function round(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

async function tryReadJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T;
  } catch {
    return undefined;
  }
}
