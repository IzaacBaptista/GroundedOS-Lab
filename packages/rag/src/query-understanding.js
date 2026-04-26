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
// Synonym / expansion map
// ---------------------------------------------------------------------------
// Keys are canonical terms; values are synonyms to merge into the query
// for the lexical embedding provider.
const SYNONYM_MAP = {
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
const INTENT_PATTERNS = [
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
/**
 * Normalise the raw query for better lexical matching.
 *
 * Rules (Phase 2 — rule-based, no LLM):
 *   - Lowercase and normalise Unicode
 *   - Strip common filler words
 *   - Collapse multiple spaces
 *   - Returns undefined when the rewritten form matches the original
 */
export function rewriteQuery(text) {
    const normalised = text
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[^\w\s'-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const tokens = normalised.split(/\s+/).filter((t) => !FILLER_WORDS.has(t) && t.length > 0);
    const rewritten = tokens.join(" ");
    // Return undefined if the result is empty or identical to the lowercased original
    if (rewritten.length === 0 || rewritten === normalised) {
        return undefined;
    }
    return rewritten;
}
// ---------------------------------------------------------------------------
// Stage 2: Query Expansion
// ---------------------------------------------------------------------------
/**
 * Generate lexical variants for the key terms in the query.
 * Returns an array of additional terms to append to the retrieval query.
 */
export function expandQuery(text) {
    const lower = text.toLowerCase();
    const tokens = lower.match(/\b\w+\b/g) ?? [];
    const added = new Set();
    const expanded = [];
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
function normalizeToken(token) {
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
export function detectIntent(text) {
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
// Public API
// ---------------------------------------------------------------------------
/**
 * Process a raw query through the three-stage pipeline and return a
 * `ProcessedQuery` ready for downstream retrieval.
 */
export function processQuery(raw) {
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
    const intent = raw.intent && isValidIntent(raw.intent) ? raw.intent : detectedIntent;
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
const VALID_INTENTS = new Set([
    "factual",
    "comparative",
    "procedural",
    "exploratory",
    "unknown",
]);
function isValidIntent(value) {
    return VALID_INTENTS.has(value);
}
//# sourceMappingURL=query-understanding.js.map