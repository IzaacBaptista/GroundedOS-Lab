/**
 * Query Understanding layer (Concept 1 — Phase 2).
 *
 * Transforms a raw user query into a richer `ProcessedQuery` before RAG
 * retrieval to improve recall and intent-aligned ranking.
 *
 * Three stages (all rule-based in Phase 2 — deterministic, no LLM required):
 *   1. Rewriting  — lower-case, strip filler words, normalise whitespace
 *   2. Expansion  — generate lexical variants from a static synonym map
 *   3. Intent detection — classify into five QueryIntent categories
 */

import type { ProcessedQuery, QueryIntent, RawQuery } from "@groundedos/core";

// ---------------------------------------------------------------------------
// Filler words stripped during rewriting
// ---------------------------------------------------------------------------

const FILLER_WORDS = new Set([
  "please", "tell", "me", "about", "can", "you", "could", "would", "should",
  "what", "is", "are", "was", "were", "how", "do", "does", "did", "the",
  "a", "an", "i", "my", "in", "on", "at", "to", "for", "of", "with",
  "just", "want", "know", "need", "give", "explain", "describe",
]);

// ---------------------------------------------------------------------------
// Abbreviation expansion — a real dictionary lookup, not a stopword filter.
// Book cap. 17: "corrigir erros de digitação, expandir abreviações [...]".
// ---------------------------------------------------------------------------

const ABBREVIATION_MAP: Record<string, string> = {
  db: "database",
  auth: "authentication",
  config: "configuration",
  repo: "repository",
  api: "application programming interface",
  ui: "user interface",
  ux: "user experience",
  k8s: "kubernetes",
  ci: "continuous integration",
  cd: "continuous deployment",
  env: "environment",
  perf: "performance",
  infra: "infrastructure",
  docs: "documentation",
};

/**
 * Book cap. 17: words that signal the query refers back to something from
 * an earlier turn ("what about it?", "does that scale?") without naming it.
 */
const ANAPHORIC_REFERENCE_WORDS = new Set(["it", "that", "this", "those", "them", "he", "she"]);

// ---------------------------------------------------------------------------
// Synonym / expansion map
// ---------------------------------------------------------------------------
// Keys are canonical terms; values are synonyms to merge into the query
// for the lexical embedding provider.

const SYNONYM_MAP: Record<string, string[]> = {
  rag: ["retrieval augmented generation", "retrieval-augmented generation"],
  llm: ["large language model", "language model", "language model inference"],
  embedding: ["embedding vector", "vector representation", "semantic vector"],
  chunk: ["document chunk", "text chunk", "segment"],
  vector: ["embedding", "vector representation"],
  retrieval: ["document retrieval", "information retrieval", "search"],
  inference: ["model inference", "llm inference", "generation"],
  fine: ["fine-tuning", "finetuning", "model fine-tuning"],
  tuning: ["fine-tuning", "finetuning"],
  lora: ["low-rank adaptation", "parameter-efficient fine-tuning"],
  quantization: ["model quantization", "weight quantization", "int8", "int4"],
  grounding: ["grounded generation", "factual grounding", "source grounding"],
  hallucination: ["hallucination", "confabulation", "factual error"],
  cosine: ["cosine similarity", "dot product similarity"],
  similarity: ["cosine similarity", "semantic similarity", "vector similarity"],
  token: ["input token", "output token", "tokenization"],
  context: ["context window", "prompt context", "input context"],
  prompt: ["prompt template", "instruction", "system prompt"],
  agent: ["ai agent", "autonomous agent", "planning agent"],
  memory: ["conversation memory", "episodic memory", "long-term memory"],
  evaluation: ["eval", "evaluation", "benchmark", "assessment"],
  eval: ["evaluation", "benchmark", "quality assessment"],
};

// ---------------------------------------------------------------------------
// Intent detection patterns
// ---------------------------------------------------------------------------

const INTENT_PATTERNS: Array<{
  intent: QueryIntent;
  patterns: RegExp[];
  confidence: number;
}> = [
  {
    intent: "comparative",
    patterns: [
      /\b(vs|versus|compared to|compare|difference between|better than|worse than|pros and cons|trade.?off)\b/i,
    ],
    confidence: 0.9,
  },
  {
    intent: "procedural",
    patterns: [
      /\b(how (do|to|can|should|would)|steps (to|for)|guide (to|for)|implement|configure|set up|install|create|build|run|execute|deploy)\b/i,
    ],
    confidence: 0.85,
  },
  {
    intent: "factual",
    patterns: [
      /\b(what (is|are|was|were)|define|definition|explain|meaning( of)?|describe)\b/i,
      /^(what|who|where|when|which)\b/i,
    ],
    confidence: 0.8,
  },
  {
    intent: "exploratory",
    patterns: [
      /\b(tell me about|overview|survey|summary of|all about|explore|learn about|understand)\b/i,
    ],
    confidence: 0.75,
  },
];

// ---------------------------------------------------------------------------
// Stage 1: Query Rewriting
// ---------------------------------------------------------------------------

export interface RewriteQueryOptions {
  /**
   * Book cap. 17: the previous turn's query, used to resolve a bare
   * anaphoric reference ("what about it?") by appending what "it" likely
   * refers to. Heuristic — real reference resolution needs an LLM or
   * coreference model; this just reuses the last turn's content words.
   */
  previousQuery?: string;
  /**
   * Book cap. 17: a known-good vocabulary (e.g. terms seen in the corpus)
   * used for typo correction via edit distance. Unset by default — without
   * a real vocabulary there's no way to tell a typo from a rare-but-valid
   * term, so no correction is attempted.
   */
  vocabulary?: string[];
}

/**
 * Normalise the raw query for better lexical matching.
 *
 * Rules (Phase 2 — rule-based, no LLM):
 *   - Lowercase and normalise Unicode
 *   - Expand known abbreviations (real dictionary lookup)
 *   - Resolve a bare anaphoric reference using the previous turn, if given
 *   - Correct typos against a supplied vocabulary, if given
 *   - Strip common filler words
 *   - Collapse multiple spaces
 *   - Returns undefined when the rewritten form matches the original
 */
export function rewriteQuery(text: string, options: RewriteQueryOptions = {}): string | undefined {
  const normalised = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let tokens = normalised.split(/\s+/).filter((t) => t.length > 0);

  tokens = tokens.flatMap((token) => {
    const expansion = ABBREVIATION_MAP[token];
    return expansion ? expansion.split(" ") : [token];
  });

  if (options.previousQuery && tokens.some((token) => ANAPHORIC_REFERENCE_WORDS.has(token))) {
    const previousContentWords = options.previousQuery
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\w\s'-]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 0 && !FILLER_WORDS.has(token));

    tokens = [...tokens, ...previousContentWords];
  }

  if (options.vocabulary && options.vocabulary.length > 0) {
    const vocabularySet = new Set(options.vocabulary.map((term) => term.toLowerCase()));
    tokens = tokens.map((token) => correctTypo(token, vocabularySet));
  }

  const rewritten = tokens.filter((t) => !FILLER_WORDS.has(t) && t.length > 0).join(" ");

  // Return undefined if the result is empty or identical to the lowercased original
  if (rewritten.length === 0 || rewritten === normalised) {
    return undefined;
  }

  return rewritten;
}

/**
 * Replaces `token` with the closest word in `vocabulary` when it's exactly
 * one edit (insertion/deletion/substitution) away and `token` itself isn't
 * already a known word — corrects an actual typo without touching rare but
 * valid terms that just happen to be short.
 */
function correctTypo(token: string, vocabulary: Set<string>): string {
  if (token.length < 3 || vocabulary.has(token)) {
    return token;
  }

  for (const candidate of vocabulary) {
    if (Math.abs(candidate.length - token.length) <= 1 && levenshteinDistance(token, candidate) === 1) {
      return candidate;
    }
  }

  return token;
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distances: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) distances[i]![0] = i;
  for (let j = 0; j < cols; j += 1) distances[0]![j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      distances[i]![j] = Math.min(
        distances[i - 1]![j]! + 1,
        distances[i]![j - 1]! + 1,
        distances[i - 1]![j - 1]! + cost
      );
    }
  }

  return distances[rows - 1]![cols - 1]!;
}

// ---------------------------------------------------------------------------
// Stage 2: Query Expansion
// ---------------------------------------------------------------------------

/**
 * Generate lexical variants for the key terms in the query.
 * Returns an array of additional terms to append to the retrieval query.
 */
export function expandQuery(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens = lower.match(/\b\w+\b/g) ?? [];
  const added = new Set<string>();
  const expanded: string[] = [];

  for (const token of tokens) {
    const synonyms = SYNONYM_MAP[token] ?? SYNONYM_MAP[normalizeToken(token)];

    if (synonyms) {
      for (const synonym of synonyms) {
        if (!added.has(synonym)) {
          added.add(synonym);
          expanded.push(synonym);
        }
      }
    }
  }

  return expanded;
}

function normalizeToken(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.length > 4 && token.endsWith("es")) {
    return token.slice(0, -2);
  }

  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }

  return token;
}

// ---------------------------------------------------------------------------
// Stage 3: Intent Detection
// ---------------------------------------------------------------------------

/**
 * Classify the query into a QueryIntent.
 * Returns the intent with the highest-confidence matching pattern.
 */
export function detectIntent(text: string): { intent: QueryIntent; confidence: number } {
  for (const { intent, patterns, confidence } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return { intent, confidence };
      }
    }
  }

  return { intent: "unknown", confidence: 0.5 };
}

// ---------------------------------------------------------------------------
// Query filters — implicit constraints extracted into structured metadata
// filters (book cap. 17). Only explicit `key:value` tokens are recognized
// (e.g. "tag:billing", "author:maria", "tenant:acme") — free natural-
// language constraints ("a política de reembolso em 2023") are NOT parsed:
// that needs NER/an LLM, not a formula, and chunks don't carry a bare
// "year" field to filter against anyway. Disclosed limitation, not theater.
// ---------------------------------------------------------------------------

const QUERY_FILTER_FIELDS: Record<string, string> = {
  tag: "tags",
  author: "author",
  tenant: "tenantId",
};

export interface ExtractedQueryFilters {
  filters: Record<string, string>;
  /** The query text with every recognized `key:value` token removed. */
  residualQuery: string;
}

/**
 * Extracts explicit `key:value` tokens (tag:, author:, tenant:) from a
 * query into a structured filter object, and returns the remaining query
 * text with those tokens stripped.
 */
export function extractQueryFilters(text: string): ExtractedQueryFilters {
  const filters: Record<string, string> = {};
  const pattern = /\b(tag|author|tenant):(\S+)\b/gi;

  const residualQuery = text
    .replace(pattern, (_match, rawKey: string, rawValue: string) => {
      const field = QUERY_FILTER_FIELDS[rawKey.toLowerCase()];
      if (field) {
        filters[field] = rawValue;
      }
      return "";
    })
    .replace(/\s+/g, " ")
    .trim();

  return { filters, residualQuery };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Process a raw query through the three-stage pipeline and return a
 * `ProcessedQuery` ready for downstream retrieval.
 */
export function processQuery(raw: RawQuery): ProcessedQuery {
  const text = (raw.text ?? "").trim();

  if (text.length === 0) {
    return {
      original: text,
      expanded: [],
      intent: "unknown",
      confidence: 0,
    };
  }

  const rewritten = rewriteQuery(text);
  const workingText = rewritten ?? text;

  const expanded = expandQuery(workingText);
  const { intent: detectedIntent, confidence } = detectIntent(text);

  // Caller-supplied intent overrides detection (but we still report our confidence)
  const intent: QueryIntent =
    raw.intent && isValidIntent(raw.intent) ? raw.intent : detectedIntent;

  return {
    original: text,
    rewritten,
    expanded,
    intent,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_INTENTS = new Set<QueryIntent>([
  "factual",
  "comparative",
  "procedural",
  "exploratory",
  "unknown",
]);

function isValidIntent(value: string): value is QueryIntent {
  return VALID_INTENTS.has(value as QueryIntent);
}
