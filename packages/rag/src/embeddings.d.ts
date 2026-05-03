import type { RetrievalChunk } from "./chunking";
export type EmbeddingVector = number[];
export type EmbeddingProviderId = "local-hash" | "api-lexical" | "ollama" | "openai" | "semantic-placeholder";
export interface EmbeddingModelInfo {
    provider: EmbeddingProviderId;
    model: string;
    dimensions: number;
    normalized: boolean;
    maxInputChars?: number;
}
export interface EmbedTextInput {
    id?: string;
    text: string;
    metadata?: Record<string, unknown>;
}
export interface EmbedTextResult {
    vector: EmbeddingVector;
    model: EmbeddingModelInfo;
    usage?: {
        inputTokens?: number;
        estimatedChars?: number;
    };
}
export interface SemanticEmbeddingsProvider {
    readonly id: EmbeddingProviderId;
    getModelInfo(): EmbeddingModelInfo;
    embedOne(input: EmbedTextInput): Promise<EmbedTextResult>;
    embedMany(inputs: EmbedTextInput[]): Promise<EmbedTextResult[]>;
}
export interface EmbeddingProvider {
    readonly name: string;
    readonly dimensions: number;
    readonly modelInfo?: EmbeddingModelInfo;
    embedTexts(texts: string[]): Promise<EmbeddingVector[]>;
}
export interface EmbeddedChunk extends RetrievalChunk {
    embedding: EmbeddingVector;
    embeddingMetadata: {
        provider: string;
        dimensions: number;
        model?: string;
        normalized?: boolean;
    };
}
export interface DeterministicEmbeddingProviderOptions {
    name?: string;
    dimensions?: number;
}
export interface LocalHashEmbeddingsProviderOptions {
    dimensions?: number;
    model?: string;
    maxInputChars?: number;
}
export interface OllamaEmbeddingsProviderOptions {
    baseUrl?: string;
    model?: string;
    dimensions?: number;
    maxInputChars?: number;
    truncate?: boolean;
    keepAlive?: string;
    requestTimeoutMs?: number;
    fetchFn?: typeof fetch;
}
export interface OpenAIEmbeddingsProviderOptions {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    dimensions?: number;
    maxInputChars?: number;
    requestTimeoutMs?: number;
    organization?: string;
    project?: string;
    fetchFn?: typeof fetch;
}
export interface EmbeddingProviderRegistry {
    get(providerId: EmbeddingProviderId): SemanticEmbeddingsProvider;
    list(): EmbeddingModelInfo[];
}
export declare function embedChunks(chunks: RetrievalChunk[], provider: EmbeddingProvider): Promise<EmbeddedChunk[]>;
export declare class LocalHashEmbeddingsProvider implements SemanticEmbeddingsProvider {
    readonly id: "local-hash";
    private readonly dimensions;
    private readonly model;
    private readonly maxInputChars;
    constructor(options?: LocalHashEmbeddingsProviderOptions);
    getModelInfo(): EmbeddingModelInfo;
    embedOne(input: EmbedTextInput): Promise<EmbedTextResult>;
    embedMany(inputs: EmbedTextInput[]): Promise<EmbedTextResult[]>;
}
export declare class OllamaEmbeddingsProvider implements SemanticEmbeddingsProvider {
    readonly id: "ollama";
    private readonly baseUrl;
    private readonly model;
    private readonly dimensions;
    private readonly maxInputChars;
    private readonly truncate;
    private readonly keepAlive;
    private readonly requestTimeoutMs;
    private readonly fetchFn;
    constructor(options?: OllamaEmbeddingsProviderOptions);
    getModelInfo(): EmbeddingModelInfo;
    embedOne(input: EmbedTextInput): Promise<EmbedTextResult>;
    embedMany(inputs: EmbedTextInput[]): Promise<EmbedTextResult[]>;
    private requestEmbeddings;
}
export declare class OpenAIEmbeddingsProvider implements SemanticEmbeddingsProvider {
    readonly id: "openai";
    private readonly apiKey;
    private readonly baseUrl;
    private readonly model;
    private readonly dimensions;
    private readonly maxInputChars;
    private readonly requestTimeoutMs;
    private readonly organization;
    private readonly project;
    private readonly fetchFn;
    constructor(options?: OpenAIEmbeddingsProviderOptions);
    getModelInfo(): EmbeddingModelInfo;
    embedOne(input: EmbedTextInput): Promise<EmbedTextResult>;
    embedMany(inputs: EmbedTextInput[]): Promise<EmbedTextResult[]>;
    private requestEmbeddings;
}
export declare class DeterministicEmbeddingProvider implements EmbeddingProvider {
    readonly name: string;
    readonly dimensions: number;
    constructor(options?: DeterministicEmbeddingProviderOptions);
    embedTexts(texts: string[]): Promise<EmbeddingVector[]>;
}
export declare function semanticToEmbeddingProvider(provider: SemanticEmbeddingsProvider): EmbeddingProvider;
export declare function embeddingProviderToSemantic(provider: EmbeddingProvider, modelInfo?: Partial<EmbeddingModelInfo>): SemanticEmbeddingsProvider;
export declare function createEmbeddingProviderRegistry(providers?: SemanticEmbeddingsProvider[]): EmbeddingProviderRegistry;
