/**
 * @groundedos/evals tests
 *
 * Test fixtures for evaluation scorers: faithfulness, relevance, recall.
 */

import { describe, it, expect } from 'vitest';
import { FaithfulnessEvaluator, RelevanceEvaluator, RecallEvaluator, EvaluatorChain } from './scorers/index';

describe('Evaluators — Faithfulness, Relevance, Recall', () => {
  describe('FaithfulnessEvaluator', () => {
    const evaluator = new FaithfulnessEvaluator();

    it('should score high when answer is grounded in context', async () => {
      const result = await evaluator.evaluate({
        question: 'What is the capital of France?',
        answer: 'According to the document, Paris is the capital of France.',
        retrievedChunks: [
          {
            chunkId: 'chunk-1',
            text: 'Paris is the capital of France and is located on the Seine river.',
            score: 0.95,
          },
        ],
      });

      expect(result.score).toBeGreaterThan(0.5);
      expect(result.passed).toBe(true);
      expect(result.label).toBe('faithfulness');
      expect(result.details).toBeDefined();
    });

    it('should score low when answer includes ungrounded claims', async () => {
      const result = await evaluator.evaluate({
        question: 'What is the capital of France?',
        answer: 'I believe the capital is London based on my knowledge.',
        retrievedChunks: [
          {
            chunkId: 'chunk-1',
            text: 'Paris is the capital of France.',
            score: 0.95,
          },
        ],
      });

      expect(result.score).toBeLessThan(0.8);
    });

    it('should handle empty retrieved chunks', async () => {
      const result = await evaluator.evaluate({
        question: 'What is the capital of France?',
        answer: 'Paris is the capital of France.',
        retrievedChunks: [],
      });

      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
    });
  });

  describe('RelevanceEvaluator', () => {
    const evaluator = new RelevanceEvaluator();

    it('should score high when answer directly addresses question', async () => {
      const result = await evaluator.evaluate({
        question: 'What is the capital of France?',
        answer: 'The capital of France is Paris, located in the north-central part of the country.',
        retrievedChunks: [
          {
            chunkId: 'chunk-1',
            text: 'Paris is the capital of France.',
            score: 0.95,
          },
        ],
      });

      expect(result.score).toBeGreaterThan(0.5);
      expect(result.passed).toBe(true);
      expect(result.label).toBe('relevance');
    });

    it('should score low when answer is too brief', async () => {
      const result = await evaluator.evaluate({
        question: 'What is the capital of France and describe its history and geography?',
        answer: 'Paris.',
        retrievedChunks: [
          {
            chunkId: 'chunk-1',
            text: 'Paris is the capital of France with a rich history spanning over 2000 years.',
            score: 0.95,
          },
        ],
      });

      expect(result.score).toBeLessThan(0.6);
    });

    it('should score low when answer evades the question', async () => {
      const result = await evaluator.evaluate({
        question: 'What is the capital of France?',
        answer: 'I do not know the answer to this question.',
        retrievedChunks: [
          {
            chunkId: 'chunk-1',
            text: 'Paris is the capital of France.',
            score: 0.95,
          },
        ],
      });

      expect(result.score).toBeLessThan(0.5);
      expect(result.passed).toBe(false);
    });

    it('should handle no answer', async () => {
      const result = await evaluator.evaluate({
        question: 'What is the capital of France?',
        answer: '',
        retrievedChunks: [
          {
            chunkId: 'chunk-1',
            text: 'Paris is the capital of France.',
            score: 0.95,
          },
        ],
      });

      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
    });
  });

  describe('RecallEvaluator', () => {
    const evaluator = new RecallEvaluator(3);

    it('should score 1.0 when all expected chunks are in top-3', async () => {
      const result = await evaluator.evaluate({
        question: 'Test question',
        answer: 'Test answer',
        retrievedChunks: [
          { chunkId: 'expected-1', text: 'text 1', score: 0.9 },
          { chunkId: 'expected-2', text: 'text 2', score: 0.85 },
          { chunkId: 'expected-3', text: 'text 3', score: 0.8 },
        ],
        expectedChunkIds: ['expected-1', 'expected-2', 'expected-3'],
      });

      expect(result.score).toBe(1.0);
      expect(result.passed).toBe(true);
      expect(result.label).toBe('recall@3');
    });

    it('should score 0.67 when 2 of 3 expected chunks found', async () => {
      const result = await evaluator.evaluate({
        question: 'Test question',
        answer: 'Test answer',
        retrievedChunks: [
          { chunkId: 'expected-1', text: 'text 1', score: 0.9 },
          { chunkId: 'expected-2', text: 'text 2', score: 0.85 },
          { chunkId: 'other', text: 'other', score: 0.7 },
        ],
        expectedChunkIds: ['expected-1', 'expected-2', 'expected-3'],
      });

      expect(result.score).toBeCloseTo(0.667, 2);
      expect(result.passed).toBe(true);
    });

    it('should score 0 when no expected chunks found', async () => {
      const result = await evaluator.evaluate({
        question: 'Test question',
        answer: 'Test answer',
        retrievedChunks: [
          { chunkId: 'other-1', text: 'text 1', score: 0.5 },
          { chunkId: 'other-2', text: 'text 2', score: 0.4 },
        ],
        expectedChunkIds: ['expected-1', 'expected-2'],
      });

      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
    });

    it('should handle no expected chunks (perfect recall)', async () => {
      const result = await evaluator.evaluate({
        question: 'Test question',
        answer: 'Test answer',
        retrievedChunks: [
          { chunkId: 'chunk-1', text: 'text 1', score: 0.9 },
        ],
      });

      expect(result.score).toBe(1);
      expect(result.passed).toBe(true);
    });
  });

  describe('EvaluatorChain', () => {
    it('should register and execute multiple evaluators', async () => {
      const chain = new EvaluatorChain();
      chain.register(new FaithfulnessEvaluator());
      chain.register(new RelevanceEvaluator());

      const summary = await chain.evaluate({
        question: 'What is the capital of France?',
        answer: 'According to the text, Paris is the capital of France.',
        retrievedChunks: [
          {
            chunkId: 'chunk-1',
            text: 'Paris is the capital of France.',
            score: 0.95,
          },
        ],
      });

      expect(summary.totalCount).toBe(2);
      expect(summary.results.size).toBe(2);
      expect(summary.averageScore).toBeGreaterThan(0);
      expect(summary.passedCount).toBeGreaterThanOrEqual(1);
    });

    it('should calculate aggregates correctly', async () => {
      const chain = new EvaluatorChain();
      chain.register(new FaithfulnessEvaluator());
      chain.register(new RelevanceEvaluator());
      chain.register(new RecallEvaluator(3));

      const summary = await chain.evaluate({
        question: 'Test?',
        answer: 'Good answer based on the document.',
        retrievedChunks: [
          { chunkId: 'exp-1', text: 'Relevant content', score: 0.9 },
          { chunkId: 'exp-2', text: 'More content', score: 0.8 },
          { chunkId: 'exp-3', text: 'Additional info', score: 0.7 },
        ],
        expectedChunkIds: ['exp-1', 'exp-2', 'exp-3'],
      });

      expect(summary.totalCount).toBe(3);
      expect(summary.averageScore).toBeGreaterThanOrEqual(0);
      expect(summary.averageScore).toBeLessThanOrEqual(1);
      expect(summary.passedCount).toBeLessThanOrEqual(3);
    });

    it('should allow registering and deregistering evaluators', () => {
      const chain = new EvaluatorChain();
      const eval1 = new FaithfulnessEvaluator();

      chain.register(eval1);
      expect(chain.list()).toHaveLength(1);

      chain.deregister('faithfulness');
      expect(chain.list()).toHaveLength(0);
    });
  });
});
