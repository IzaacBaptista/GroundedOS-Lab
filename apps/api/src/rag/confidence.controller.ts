import { Body, Controller, Get, Post } from "@nestjs/common";
import {
  ConfidenceCalibrationEngine,
  ConfidencePolicyEngine,
  buildRetrievalDiagnostics,
  calibrateConfidence,
  type CalibrationProfile,
  type RetrievalEvidenceChunk,
} from "../retrieval-reliability";

type ConfidenceInputBody = {
  query?: string;
  answer?: string;
  retrievedChunks: RetrievalEvidenceChunk[];
  citations?: Array<{ chunkId: string }>;
  retrievalTrace?: {
    mode?: string;
    provider?: string;
    model?: string;
    queryIntent?: string;
    candidateCount?: number;
  };
  rerankTrace?: Array<{ chunkId: string; beforeRank: number; afterRank: number; finalScore?: number }>;
  confidenceProfile?: CalibrationProfile;
  includeContradictionCheck?: boolean;
  includeCoverageCheck?: boolean;
  includeAgreementCheck?: boolean;
  devMode?: boolean;
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
};

@Controller("confidence")
export class ConfidenceController {
  private readonly policyEngine = new ConfidencePolicyEngine();
  private readonly calibrationEngine = new ConfidenceCalibrationEngine();

  @Post("score")
  score(@Body() body: ConfidenceInputBody) {
    const diagnostics = this.buildDiagnostics(body);
    return calibrateConfidence({
      query: body.query,
      diagnostics,
      chunks: body.retrievedChunks,
      rerankTrace: body.rerankTrace,
      profile: body.confidenceProfile,
      evals: body.evals,
    });
  }

  @Post("calibrate")
  calibrate(@Body() body: ConfidenceInputBody) {
    const diagnostics = this.buildDiagnostics(body);
    return this.calibrationEngine.calibrate({
      query: body.query,
      diagnostics,
      chunks: body.retrievedChunks,
      rerankTrace: body.rerankTrace,
      profile: body.confidenceProfile,
      evals: body.evals,
    });
  }

  @Post("evaluate")
  evaluate(@Body() body: ConfidenceInputBody) {
    const diagnostics = this.buildDiagnostics(body);
    const simpleScore = Number(diagnostics.topScore.toFixed(3));
    const calibrated = this.calibrationEngine.calibrate({
      query: body.query,
      diagnostics,
      chunks: body.retrievedChunks,
      rerankTrace: body.rerankTrace,
      profile: body.confidenceProfile,
      evals: body.evals,
    });
    return {
      simpleScore,
      calibratedScore: calibrated.overallConfidence,
      delta: Number((calibrated.overallConfidence - simpleScore).toFixed(3)),
      calibratedLabel: calibrated.label,
      recommendedAction: calibrated.recommendedAction,
    };
  }

  @Post("explain")
  explain(@Body() body: ConfidenceInputBody) {
    const diagnostics = this.buildDiagnostics(body);
    return this.calibrationEngine.calibrate({
      query: body.query,
      diagnostics,
      chunks: body.retrievedChunks,
      rerankTrace: body.rerankTrace,
      profile: body.confidenceProfile,
      evals: body.evals,
    }).trace;
  }

  @Get("policies")
  policies() {
    return this.policyEngine.getPolicy();
  }

  @Get("runs")
  runs() {
    return {
      runs: [],
    };
  }

  private buildDiagnostics(body: ConfidenceInputBody) {
    return buildRetrievalDiagnostics({
      results: body.retrievedChunks ?? [],
      candidateCount: body.retrievalTrace?.candidateCount,
      citations: body.citations,
      evals: {
        groundedness: body.evals?.groundedness,
        answerOverlap: body.evals?.answerOverlap,
      },
      retrievalMode: body.retrievalTrace?.mode,
      rerankingApplied: Boolean(body.rerankTrace?.length),
      provider: body.retrievalTrace?.provider,
      model: body.retrievalTrace?.model,
      queryIntent: body.retrievalTrace?.queryIntent,
    });
  }
}
