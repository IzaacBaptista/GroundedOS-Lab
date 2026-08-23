/**
 * Book cap. 15 — Sparse retrieval: TF-IDF and BM25.
 *
 * These are real term-frequency-based lexical scoring functions — not a
 * character-overlap heuristic. BM25 is the book's stated de facto standard
 * ("quando alguém menciona busca por palavra-chave... está quase sempre se
 * referindo a alguma variação de BM25") and is what `retrieval.ts` uses for
 * the sparse side of hybrid search; TF-IDF is exposed too since it's the
 * conceptual foundation BM25 refines (term saturation + document-length
 * normalization), matching the book's own framing of one evolving into
 * the other.
 *
 * "Sparse embeddings" (learned sparse vectors, e.g. SPLADE) — the third
 * concept this chapter covers — are not implemented: they require a real
 * trained model, not a formula, and are out of scope here (see ADR-028).
 */

const ERROR_PREFIX = "[rag/sparse-retrieval]";

const DEFAULT_BM25_K1 = 1.2;
const DEFAULT_BM25_B = 0.75;

export function tokenize(text: string): string[] {
  return text.normalize("NFKC").toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

export interface TermFrequencies {
  counts: Map<string, number>;
  length: number;
}

export function computeTermFrequencies(tokens: string[]): TermFrequencies {
  const counts = new Map<string, number>();

  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return { counts, length: tokens.length };
}

export interface SparseDocument {
  id: string;
  termFrequencies: TermFrequencies;
}

export interface CorpusStats {
  documents: SparseDocument[];
  documentFrequency: Map<string, number>;
  averageDocumentLength: number;
}

/**
 * Builds the statistics both TF-IDF and BM25 need: per-document term
 * frequencies, how many documents each term appears in (document
 * frequency — the "DF" in IDF), and the corpus's average document length
 * (BM25's length-normalization baseline).
 */
export function buildCorpusStats(documents: Array<{ id: string; text: string }>): CorpusStats {
  const parsed = documents.map((document) => ({
    id: document.id,
    termFrequencies: computeTermFrequencies(tokenize(document.text)),
  }));

  const documentFrequency = new Map<string, number>();
  for (const document of parsed) {
    for (const term of document.termFrequencies.counts.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const totalLength = parsed.reduce((sum, document) => sum + document.termFrequencies.length, 0);
  const averageDocumentLength = parsed.length > 0 ? totalLength / parsed.length : 0;

  return { documents: parsed, documentFrequency, averageDocumentLength };
}

/**
 * Classic smoothed IDF: `ln((N + 1) / (df + 1)) + 1`. Always positive
 * (unlike BM25's own IDF variant), which is what makes plain TF-IDF scores
 * additive and comparable across terms without going negative for very
 * common terms.
 */
function tfIdfWeight(documentFrequency: number, totalDocuments: number): number {
  return Math.log((totalDocuments + 1) / (documentFrequency + 1)) + 1;
}

/** TF-IDF score of a document against a (tokenized) query — cap. 15's conceptual foundation for BM25. */
export function tfIdfScore(
  queryTokens: string[],
  doc: SparseDocument,
  documentFrequency: Map<string, number>,
  totalDocuments: number
): number {
  let score = 0;

  for (const term of queryTokens) {
    const tf = doc.termFrequencies.counts.get(term) ?? 0;
    if (tf === 0) continue;

    const df = documentFrequency.get(term) ?? 0;
    score += tf * tfIdfWeight(df, totalDocuments);
  }

  return score;
}

/**
 * BM25's own IDF variant (Robertson–Spärck Jones): `ln((N - df + 0.5) / (df + 0.5) + 1)`.
 * Floored at 0 via the `+ 1` inside the log so a term present in every
 * document never produces a negative weight.
 */
function bm25InverseDocumentFrequency(documentFrequency: number, totalDocuments: number): number {
  return Math.log((totalDocuments - documentFrequency + 0.5) / (documentFrequency + 0.5) + 1);
}

export interface Bm25Params {
  /** Term-frequency saturation: higher lets repeated terms keep adding score longer (default: 1.2). */
  k1?: number;
  /** Document-length normalization strength, 0 (off) to 1 (full) (default: 0.75). */
  b?: number;
}

/**
 * BM25 score of a document against a (tokenized) query. Both parameters
 * are the book's exact two knobs: `k1` saturates repeated-term benefit
 * (the 10th occurrence of a word barely matters more than the 2nd), `b`
 * normalizes by document length (so a longer document doesn't win purely
 * by containing more text).
 */
export function bm25Score(
  queryTokens: string[],
  doc: SparseDocument,
  documentFrequency: Map<string, number>,
  totalDocuments: number,
  averageDocumentLength: number,
  params: Bm25Params = {}
): number {
  const k1 = params.k1 ?? DEFAULT_BM25_K1;
  const b = params.b ?? DEFAULT_BM25_B;
  let score = 0;

  for (const term of queryTokens) {
    const tf = doc.termFrequencies.counts.get(term) ?? 0;
    if (tf === 0) continue;

    const df = documentFrequency.get(term) ?? 0;
    const idf = bm25InverseDocumentFrequency(df, totalDocuments);
    const lengthNorm = 1 - b + b * (doc.termFrequencies.length / (averageDocumentLength || 1));
    const denominator = tf + k1 * lengthNorm;

    score += idf * ((tf * (k1 + 1)) / (denominator || 1));
  }

  return score;
}

/**
 * Scores a candidate pool with BM25 and min-max normalizes the results to
 * `[0, 1]` across that pool, so the score is on a comparable scale to a
 * cosine-based dense score when fused in hybrid search (retrieval.ts).
 * BM25's raw scores are unbounded and depend on corpus size, so they can't
 * be fused directly the way a already-bounded cosine similarity can.
 */
export function scoreCandidatesWithBm25(
  query: string,
  candidates: Array<{ id: string; text: string }>,
  params: Bm25Params = {}
): Map<string, number> {
  if (typeof query !== "string") {
    throw new Error(`${ERROR_PREFIX} query must be a string.`);
  }

  const scores = new Map<string, number>();
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0 || candidates.length === 0) {
    for (const candidate of candidates) {
      scores.set(candidate.id, 0);
    }
    return scores;
  }

  const { documents, documentFrequency, averageDocumentLength } = buildCorpusStats(candidates);
  const totalDocuments = documents.length;

  const raw = documents.map((doc) => ({
    id: doc.id,
    score: bm25Score(queryTokens, doc, documentFrequency, totalDocuments, averageDocumentLength, params),
  }));

  const maxScore = Math.max(...raw.map((entry) => entry.score));
  const minScore = Math.min(...raw.map((entry) => entry.score));
  const range = maxScore - minScore;

  for (const entry of raw) {
    scores.set(entry.id, range > 0 ? (entry.score - minScore) / range : 0);
  }

  return scores;
}
