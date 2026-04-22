import {
  type EmbeddingProvider,
  type EmbeddingVector,
  type RetrievalDevModeOutput,
} from "../packages/rag/src/index";

const DEFAULT_LEXICAL_DIMENSIONS = 64;

export class RagCliLexicalEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;

  constructor(options: { name?: string; dimensions?: number } = {}) {
    this.name = options.name ?? "rag-cli-lexical";
    this.dimensions = options.dimensions ?? DEFAULT_LEXICAL_DIMENSIONS;

    if (this.name.trim().length === 0) {
      throw new Error("[rag-cli] embedding provider name must not be empty.");
    }

    if (!Number.isInteger(this.dimensions) || this.dimensions <= 0) {
      throw new Error("[rag-cli] embedding dimensions must be a positive integer.");
    }
  }

  async embedTexts(texts: string[]): Promise<EmbeddingVector[]> {
    return texts.map((text) => this.embedText(text));
  }

  private embedText(text: string): EmbeddingVector {
    const vector = Array.from({ length: this.dimensions }, () => 0);
    const tokens = tokenize(text);

    for (const token of tokens) {
      vector[hashToken(token) % this.dimensions] += 1;
    }

    const magnitude = Math.sqrt(
      vector.reduce((sum, value) => sum + value * value, 0)
    );

    if (magnitude === 0) {
      return vector;
    }

    return vector.map((value) => Number((value / magnitude).toFixed(12)));
  }
}

export function createGroundedAnswer(devMode: RetrievalDevModeOutput): {
  grounded: boolean;
  text: string;
  citations: Array<{
    chunkId: string;
    documentId: string;
    sectionId: string;
    score: number;
    source: RetrievalDevModeOutput["results"][number]["source"];
    offsets: RetrievalDevModeOutput["results"][number]["offsets"];
  }>;
} {
  const topResult = devMode.results[0];

  if (!topResult) {
    return {
      grounded: false,
      text: "No retrieved chunk was available for this query.",
      citations: [],
    };
  }

  return {
    grounded: true,
    text: `Based on the top retrieved chunk: ${topResult.text}`,
    citations: [
      {
        chunkId: topResult.chunkId,
        documentId: topResult.documentId,
        sectionId: topResult.sectionId,
        score: topResult.score,
        source: topResult.source,
        offsets: topResult.offsets,
      },
    ],
  };
}

export function requireCliValue(
  args: string[],
  index: number,
  option: string,
  errorPrefix: string
): string {
  const value = args[index + 1];

  if (!value || value.startsWith("-")) {
    throw new Error(`${errorPrefix} Option "${option}" requires a value.`);
  }

  return value;
}

export function parsePositiveInteger(
  value: string,
  option: string,
  errorPrefix: string
): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${errorPrefix} ${option} must be a positive integer.`);
  }

  return parsed;
}

function tokenize(text: string): string[] {
  return (text.normalize("NFKC").toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .map(stemToken)
    .filter((token) => token.length > 0);
}

function stemToken(token: string): string {
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

function hashToken(token: string): number {
  let hash = 0;

  for (let index = 0; index < token.length; index += 1) {
    hash = (hash * 31 + token.charCodeAt(index)) >>> 0;
  }

  return hash;
}
