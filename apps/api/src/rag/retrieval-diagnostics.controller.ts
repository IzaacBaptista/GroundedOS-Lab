import { Body, Controller, Get, Post } from "@nestjs/common";
import {
  RetrievalDiagnosticsEngine,
  RetrievalHealthScorer,
  compareReplaySnapshots,
  type RetrievalEvidenceChunk,
  type RetrievalFailureReason,
} from "../retrieval-reliability";

type DiagnoseRetrievalBody = {
  query: string;
  chunks: RetrievalEvidenceChunk[];
  retrievalConfig?: {
    candidateCount?: number;
    retrievalMode?: string;
    rerankingApplied?: boolean;
    provider?: string;
    model?: string;
    queryIntent?: string;
    overlapTokens?: number;
    chunkSize?: number;
  };
  citations?: Array<{ chunkId: string }>;
  evals?: {
    groundedness?: number;
    answerOverlap?: number;
    retrievalAccuracy?: number;
  };
};

@Controller("retrieval")
export class RetrievalDiagnosticsController {
  private readonly diagnosticsEngine = new RetrievalDiagnosticsEngine();
  private readonly healthScorer = new RetrievalHealthScorer();

  @Post("diagnose")
  diagnose(@Body() body: DiagnoseRetrievalBody) {
    const diagnostics = {
      resultCount: body.chunks.length,
      relevantEvidenceCount: body.chunks.filter((item) => item.score >= 0.2).length,
      candidateCount: body.retrievalConfig?.candidateCount ?? body.chunks.length,
      returnedCount: body.chunks.length,
      topScore: body.chunks[0]?.score ?? 0,
      avgScore:
        body.chunks.length === 0
          ? 0
          : body.chunks.reduce((sum, chunk) => sum + chunk.score, 0) / body.chunks.length,
      scoreSpread:
        body.chunks.length === 0
          ? 0
          : (body.chunks[0]?.score ?? 0) - Math.min(...body.chunks.map((chunk) => chunk.score)),
      sourceDiversity: new Set(body.chunks.map((item) => `${item.documentId}:${item.sectionId}`)).size,
      citationCount: new Set((body.citations ?? []).map((item) => item.chunkId)).size,
      citationCoverage: 0,
      evidenceCoverage: body.evals?.answerOverlap ?? 0,
      groundedConsistency: body.evals?.groundedness ?? 0,
      conflictCount: 0,
      conflictingChunkIds: [],
      involvedChunkIds: body.chunks.map((chunk) => chunk.chunkId),
      retrievalMetadata: {
        retrievalMode: body.retrievalConfig?.retrievalMode ?? "unknown",
        rerankingApplied: Boolean(body.retrievalConfig?.rerankingApplied),
        provider: body.retrievalConfig?.provider,
        model: body.retrievalConfig?.model,
        queryIntent: body.retrievalConfig?.queryIntent,
      },
    };
    return this.diagnosticsEngine.analyze({
      query: body.query,
      diagnostics,
      chunks: body.chunks,
      evals: body.evals,
      overlapConfig: {
        overlapTokens: body.retrievalConfig?.overlapTokens,
        chunkSize: body.retrievalConfig?.chunkSize,
      },
    });
  }

  @Post("simulate")
  simulate(@Body() body: DiagnoseRetrievalBody & { scenarios?: Array<{ name: string; topK?: number; enableHybrid?: boolean; enableReranking?: boolean; enableQueryExpansion?: boolean; enableHyde?: boolean; enableGraphRag?: boolean }> }) {
    return this.diagnose(body).simulations;
  }

  @Post("replay")
  replay(
    @Body()
    body: {
      original: Parameters<typeof compareReplaySnapshots>[0]["original"];
      replay: Parameters<typeof compareReplaySnapshots>[0]["replay"];
      originalAnswer: { text: string; grounded: boolean };
      replayAnswer: { text: string; grounded: boolean };
      originalCostUsd?: number;
      replayCostUsd?: number;
      originalLatencyMs?: number;
      replayLatencyMs?: number;
    }
  ) {
    return compareReplaySnapshots(body);
  }

  @Post("explain")
  explain(@Body() body: DiagnoseRetrievalBody) {
    return this.diagnose(body).explainability;
  }

  @Get("failures")
  getFailureTaxonomy(): { failures: RetrievalFailureReason[] } {
    return {
      failures: [
        "ambiguous_query",
        "underspecified_query",
        "semantic_drift",
        "missing_entities",
        "poor_query_rewrite",
        "multi_hop_failure",
        "chunk_too_small",
        "chunk_too_large",
        "insufficient_overlap",
        "boundary_fragmentation",
        "context_split",
        "lost_context",
        "embedding_mismatch",
        "semantic_collapse",
        "low_embedding_separation",
        "provider_quality_issue",
        "embedding_noise",
        "low_recall",
        "lexical_miss",
        "dense_retrieval_failure",
        "hybrid_disabled",
        "graph_retrieval_missing",
        "poor_candidate_pool",
        "reranker_demoted_relevant_chunk",
        "reranker_bias",
        "reranker_overfit",
        "insufficient_rerank_depth",
        "missing_document",
        "stale_document",
        "duplicated_chunks",
        "ingestion_failure",
        "OCR_failure",
        "metadata_missing",
        "groundedness_loss",
        "unsupported_claim",
        "citation_mismatch",
        "answer_overgeneralization",
      ],
    };
  }

  @Get("health")
  getRetrievalHealth() {
    return this.healthScorer.score({
      diagnostics: {
        resultCount: 0,
        relevantEvidenceCount: 0,
        candidateCount: 0,
        returnedCount: 0,
        topScore: 0,
        avgScore: 0,
        scoreSpread: 0,
        sourceDiversity: 0,
        citationCount: 0,
        citationCoverage: 0,
        evidenceCoverage: 0,
        groundedConsistency: 0,
        conflictCount: 0,
        conflictingChunkIds: [],
        involvedChunkIds: [],
        retrievalMetadata: {
          retrievalMode: "unknown",
          rerankingApplied: false,
        },
      },
      retrievalConfidence: 0,
    });
  }
}
