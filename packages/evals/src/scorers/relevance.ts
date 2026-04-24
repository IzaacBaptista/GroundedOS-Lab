/**
 * Relevance Evaluator
 *
 * Measures whether the answer adequately addresses the question.
 * Uses keyword overlap and semantic similarity heuristics.
 */

import type { Evaluator, EvalInput, EvalResult } from '../types.js';

export class RelevanceEvaluator implements Evaluator {
  readonly name = 'relevance';

  async evaluate(input: EvalInput): Promise<EvalResult> {
    const { question, answer } = input;

    if (!answer || answer.length === 0) {
      return {
        score: 0,
        passed: false,
        label: 'relevance',
        reason: 'No answer provided',
        details: { strategy: 'no-answer' },
      };
    }

    // Tokenize question and answer
    const questionTokens = this.tokenize(question);
    const answerTokens = this.tokenize(answer);

    // Calculate keyword overlap (non-stopwords)
    const overlap = questionTokens.filter(
      (token) => answerTokens.includes(token) && !this.isStopword(token),
    ).length;

    const relevantKeywords = Math.max(questionTokens.length, 1);
    const overlapRatio = overlap / relevantKeywords;

    // Length heuristic: answer should be reasonable compared to question
    const lengthRatio = answer.length / Math.max(question.length, 1);

    // Answer too short (< 20% of question) likely not addressing it
    // Answer too long (> 10x question) might be rambling
    let lengthScore = 1;

    if (lengthRatio < 0.2) {
      lengthScore = 0.3;
    } else if (lengthRatio > 10) {
      lengthScore = 0.5;
    } else if (lengthRatio < 0.5) {
      lengthScore = 0.7;
    }

    // Check for direct response patterns
    const directResponsePatterns = [
      /^(yes|no|true|false|correct|incorrect|right|wrong)/i,
      /^(the answer|the response|in short|simply|basically)/i,
      /^(according to.*,)/i,
    ];

    const hasDirectResponse = directResponsePatterns.some((pattern) => pattern.test(answer));

    // Check for question evasion
    const evasionPatterns = [
      /i don't know/i,
      /i cannot answer/i,
      /not mentioned/i,
      /unclear/i,
      /no information/i,
    ];

    const hasEvasion = evasionPatterns.some((pattern) => pattern.test(answer)) && overlapRatio < 0.3;

    // Calculate final score
    let score = (overlapRatio * 0.6 + lengthScore * 0.4) * 0.8;

    if (hasDirectResponse) {
      score = Math.min(1, score + 0.15);
    }

    if (hasEvasion) {
      score = Math.max(0, score - 0.3);
    }

    const passed = score >= 0.5;

    return {
      score: Math.round(score * 1000) / 1000,
      passed,
      label: 'relevance',
      reason: buildRelevanceReason(score, { overlapRatio, lengthScore, hasDirectResponse, hasEvasion }),
      details: {
        strategy: 'keyword-overlap-with-length-check',
        overlapRatio: Math.round(overlapRatio * 1000) / 1000,
        lengthScore: Math.round(lengthScore * 1000) / 1000,
        questionTokenCount: questionTokens.length,
        answerTokenCount: answerTokens.length,
        directResponseDetected: hasDirectResponse,
        evasionDetected: hasEvasion,
      },
    };
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\W+/)
      .filter((token) => token.length > 2);
  }

  private isStopword(token: string): boolean {
    const stopwords = new Set([
      'and',
      'or',
      'the',
      'a',
      'an',
      'is',
      'was',
      'are',
      'been',
      'be',
      'in',
      'to',
      'of',
      'for',
      'on',
      'with',
      'by',
      'at',
      'from',
      'as',
      'it',
      'can',
      'will',
      'may',
      'this',
      'that',
      'these',
      'those',
      'which',
      'who',
      'when',
      'where',
      'what',
      'why',
      'how',
    ]);

    return stopwords.has(token);
  }
}

function buildRelevanceReason(score: number, details: any): string {
  if (score >= 0.8) {
    return 'Answer directly and comprehensively addresses the question';
  }
  if (score >= 0.5) {
    const factors = [];
    if (details.overlapRatio < 0.3) factors.push('limited keyword overlap');
    if (details.lengthScore < 0.8) factors.push('unusual length');
    if (details.evasionDetected) factors.push('possible evasion');
    return `Answer has moderate relevance: ${factors.join(', ')}`;
  }
  return 'Answer does not adequately address the question';
}
