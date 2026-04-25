export const SCORE_THRESHOLDS = {
  high: 0.4,
  medium: 0.2,
  low: 0,
  zero: 0,
} as const;

export const CACHE_THRESHOLDS = {
  similarity: 0.92,
  goodRate: 0.3,
} as const;

export const LATENCY_THRESHOLDS = {
  fast: 50,
  medium: 500,
  slow: 500,
} as const;

export const INTENT_CONFIDENCE = {
  high: 0.8,
  medium: 0.6,
  low: 0.5,
} as const;
