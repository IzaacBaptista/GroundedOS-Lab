import { validateEmbeddedChunks, validateRetrievalChunks } from "@groundedos/core";
const ERROR_PREFIX = "[rag/embeddings]";
const DEFAULT_DETERMINISTIC_DIMENSIONS = 16;
const DEFAULT_DETERMINISTIC_PROVIDER_NAME = "deterministic-local";
const DEFAULT_LOCAL_HASH_DIMENSIONS = 256;
const DEFAULT_LOCAL_HASH_MODEL = "local-hash-v1";
const DEFAULT_LOCAL_HASH_MAX_INPUT_CHARS = 12_000;
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_EMBEDDING_MODEL = "embeddinggemma";
const DEFAULT_OLLAMA_EMBEDDING_DIMENSIONS = 768;
const DEFAULT_OLLAMA_MAX_INPUT_CHARS = 12_000;
const DEFAULT_OLLAMA_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_OPENAI_EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_OPENAI_MAX_INPUT_CHARS = 12_000;
const DEFAULT_OPENAI_REQUEST_TIMEOUT_MS = 30_000;
export async function embedChunks(chunks, provider) {
    validateProvider(provider);
    validateRetrievalChunks(chunks);
    if (chunks.length === 0) {
        return [];
    }
    const embeddings = await provider.embedTexts(chunks.map((chunk) => chunk.text));
    validateEmbeddings(embeddings, chunks.length, provider);
    const embedded = chunks.map((chunk, index) => ({
        ...chunk,
        embedding: embeddings[index],
        embeddingMetadata: {
            provider: provider.name,
            dimensions: provider.dimensions,
            model: provider.modelInfo?.model,
            normalized: provider.modelInfo?.normalized,
        },
    }));
    return validateEmbeddedChunks(embedded);
}
export class LocalHashEmbeddingsProvider {
    id = "local-hash";
    dimensions;
    model;
    maxInputChars;
    constructor(options = {}) {
        this.dimensions = options.dimensions ?? DEFAULT_LOCAL_HASH_DIMENSIONS;
        this.model = options.model ?? DEFAULT_LOCAL_HASH_MODEL;
        this.maxInputChars = options.maxInputChars ?? DEFAULT_LOCAL_HASH_MAX_INPUT_CHARS;
        validateDimensions(this.dimensions);
        if (this.model.trim().length === 0) {
            throw new Error(`${ERROR_PREFIX} model name must not be empty.`);
        }
        if (!Number.isInteger(this.maxInputChars) || this.maxInputChars <= 0) {
            throw new Error(`${ERROR_PREFIX} maxInputChars must be a positive integer.`);
        }
    }
    getModelInfo() {
        return {
            provider: this.id,
            model: this.model,
            dimensions: this.dimensions,
            normalized: true,
            maxInputChars: this.maxInputChars,
        };
    }
    async embedOne(input) {
        if (!input || typeof input.text !== "string") {
            throw new Error(`${ERROR_PREFIX} embed input text must be a string.`);
        }
        const text = input.text.slice(0, this.maxInputChars);
        const tokens = tokenizeForLocalHash(text);
        return {
            vector: createLocalHashEmbedding(tokens, this.dimensions),
            model: this.getModelInfo(),
            usage: {
                inputTokens: tokens.length,
                estimatedChars: input.text.length,
            },
        };
    }
    async embedMany(inputs) {
        if (!Array.isArray(inputs)) {
            throw new Error(`${ERROR_PREFIX} embedMany inputs must be an array.`);
        }
        return await Promise.all(inputs.map((input) => this.embedOne(input)));
    }
}
export class OllamaEmbeddingsProvider {
    id = "ollama";
    baseUrl;
    model;
    dimensions;
    maxInputChars;
    truncate;
    keepAlive;
    requestTimeoutMs;
    fetchFn;
    constructor(options = {}) {
        this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL);
        this.model = options.model ?? DEFAULT_OLLAMA_EMBEDDING_MODEL;
        this.dimensions = options.dimensions ?? DEFAULT_OLLAMA_EMBEDDING_DIMENSIONS;
        this.maxInputChars = options.maxInputChars ?? DEFAULT_OLLAMA_MAX_INPUT_CHARS;
        this.truncate = options.truncate ?? true;
        this.keepAlive = options.keepAlive;
        this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_OLLAMA_REQUEST_TIMEOUT_MS;
        this.fetchFn = options.fetchFn ?? fetch;
        if (this.model.trim().length === 0) {
            throw new Error(`${ERROR_PREFIX} model name must not be empty.`);
        }
        validateDimensions(this.dimensions);
        if (!Number.isInteger(this.maxInputChars) || this.maxInputChars <= 0) {
            throw new Error(`${ERROR_PREFIX} maxInputChars must be a positive integer.`);
        }
        if (!Number.isInteger(this.requestTimeoutMs) || this.requestTimeoutMs <= 0) {
            throw new Error(`${ERROR_PREFIX} requestTimeoutMs must be a positive integer.`);
        }
        if (typeof this.fetchFn !== "function") {
            throw new Error(`${ERROR_PREFIX} fetchFn must be a function.`);
        }
    }
    getModelInfo() {
        return {
            provider: this.id,
            model: this.model,
            dimensions: this.dimensions,
            normalized: true,
            maxInputChars: this.maxInputChars,
        };
    }
    async embedOne(input) {
        const [result] = await this.embedMany([input]);
        if (!result) {
            throw new Error(`${ERROR_PREFIX} ollama returned no embedding.`);
        }
        return result;
    }
    async embedMany(inputs) {
        if (!Array.isArray(inputs)) {
            throw new Error(`${ERROR_PREFIX} embedMany inputs must be an array.`);
        }
        if (inputs.length === 0) {
            return [];
        }
        const texts = inputs.map((input) => {
            if (!input || typeof input.text !== "string") {
                throw new Error(`${ERROR_PREFIX} embed input text must be a string.`);
            }
            return input.text.slice(0, this.maxInputChars);
        });
        const response = await this.requestEmbeddings(texts);
        const embeddings = validateOllamaEmbeddingResponse(response, inputs.length, this.dimensions);
        const modelInfo = this.getModelInfo();
        return embeddings.map((vector, index) => ({
            vector,
            model: modelInfo,
            usage: {
                estimatedChars: inputs[index]?.text.length ?? 0,
            },
        }));
    }
    async requestEmbeddings(texts) {
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            controller.abort();
        }, this.requestTimeoutMs);
        try {
            const response = await this.fetchFn(`${this.baseUrl}/api/embed`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    model: this.model,
                    input: texts,
                    truncate: this.truncate,
                    dimensions: this.dimensions,
                    keep_alive: this.keepAlive,
                }),
                signal: controller.signal,
            });
            if (!response.ok) {
                const message = await readResponseText(response);
                throw new Error(`${ERROR_PREFIX} ollama embed request failed with status ${response.status}${message ? `: ${message}` : "."}`);
            }
            return await response.json();
        }
        catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                throw new Error(`${ERROR_PREFIX} ollama embed request timed out.`);
            }
            throw error;
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
export class OpenAIEmbeddingsProvider {
    id = "openai";
    apiKey;
    baseUrl;
    model;
    dimensions;
    maxInputChars;
    requestTimeoutMs;
    organization;
    project;
    fetchFn;
    constructor(options = {}) {
        this.apiKey = (options.apiKey ?? "").trim();
        this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_OPENAI_BASE_URL);
        this.model = options.model ?? DEFAULT_OPENAI_EMBEDDING_MODEL;
        this.dimensions = options.dimensions ?? DEFAULT_OPENAI_EMBEDDING_DIMENSIONS;
        this.maxInputChars = options.maxInputChars ?? DEFAULT_OPENAI_MAX_INPUT_CHARS;
        this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_OPENAI_REQUEST_TIMEOUT_MS;
        this.organization = normalizeOptionalHeaderValue(options.organization);
        this.project = normalizeOptionalHeaderValue(options.project);
        this.fetchFn = options.fetchFn ?? fetch;
        if (this.apiKey.length === 0) {
            throw new Error(`${ERROR_PREFIX} openai apiKey is required.`);
        }
        if (this.model.trim().length === 0) {
            throw new Error(`${ERROR_PREFIX} model name must not be empty.`);
        }
        validateDimensions(this.dimensions);
        if (!Number.isInteger(this.maxInputChars) || this.maxInputChars <= 0) {
            throw new Error(`${ERROR_PREFIX} maxInputChars must be a positive integer.`);
        }
        if (!Number.isInteger(this.requestTimeoutMs) || this.requestTimeoutMs <= 0) {
            throw new Error(`${ERROR_PREFIX} requestTimeoutMs must be a positive integer.`);
        }
        if (typeof this.fetchFn !== "function") {
            throw new Error(`${ERROR_PREFIX} fetchFn must be a function.`);
        }
    }
    getModelInfo() {
        return {
            provider: this.id,
            model: this.model,
            dimensions: this.dimensions,
            normalized: true,
            maxInputChars: this.maxInputChars,
        };
    }
    async embedOne(input) {
        const [result] = await this.embedMany([input]);
        if (!result) {
            throw new Error(`${ERROR_PREFIX} openai returned no embedding.`);
        }
        return result;
    }
    async embedMany(inputs) {
        if (!Array.isArray(inputs)) {
            throw new Error(`${ERROR_PREFIX} embedMany inputs must be an array.`);
        }
        if (inputs.length === 0) {
            return [];
        }
        const texts = inputs.map((input) => {
            if (!input || typeof input.text !== "string") {
                throw new Error(`${ERROR_PREFIX} embed input text must be a string.`);
            }
            return input.text.slice(0, this.maxInputChars);
        });
        const response = await this.requestEmbeddings(texts);
        const embeddings = validateOpenAiEmbeddingResponse(response, inputs.length, this.dimensions);
        const modelInfo = this.getModelInfo();
        const promptTokens = typeof response?.usage?.prompt_tokens === "number"
            ? Number(response.usage.prompt_tokens)
            : undefined;
        return embeddings.map((vector, index) => ({
            vector,
            model: modelInfo,
            usage: {
                inputTokens: promptTokens,
                estimatedChars: inputs[index]?.text.length ?? 0,
            },
        }));
    }
    async requestEmbeddings(texts) {
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            controller.abort();
        }, this.requestTimeoutMs);
        try {
            const headers = {
                "content-type": "application/json",
                authorization: `Bearer ${this.apiKey}`,
            };
            if (this.organization) {
                headers["OpenAI-Organization"] = this.organization;
            }
            if (this.project) {
                headers["OpenAI-Project"] = this.project;
            }
            const response = await this.fetchFn(`${this.baseUrl}/embeddings`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    model: this.model,
                    input: texts,
                    dimensions: this.dimensions,
                    encoding_format: "float",
                }),
                signal: controller.signal,
            });
            if (!response.ok) {
                const message = await readResponseText(response);
                throw new Error(`${ERROR_PREFIX} openai embed request failed with status ${response.status}${message ? `: ${message}` : "."}`);
            }
            return await response.json();
        }
        catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                throw new Error(`${ERROR_PREFIX} openai embed request timed out.`);
            }
            throw error;
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
export class DeterministicEmbeddingProvider {
    name;
    dimensions;
    constructor(options = {}) {
        this.name = options.name ?? DEFAULT_DETERMINISTIC_PROVIDER_NAME;
        this.dimensions = options.dimensions ?? DEFAULT_DETERMINISTIC_DIMENSIONS;
        if (this.name.trim().length === 0) {
            throw new Error(`${ERROR_PREFIX} provider name must not be empty.`);
        }
        validateDimensions(this.dimensions);
    }
    async embedTexts(texts) {
        return texts.map((text) => createDeterministicEmbedding(text, this.dimensions));
    }
}
export function semanticToEmbeddingProvider(provider) {
    if (!provider || typeof provider.getModelInfo !== "function") {
        throw new Error(`${ERROR_PREFIX} semantic provider is required.`);
    }
    const modelInfo = provider.getModelInfo();
    validateModelInfo(modelInfo);
    return {
        name: modelInfo.provider,
        dimensions: modelInfo.dimensions,
        modelInfo,
        async embedTexts(texts) {
            if (!Array.isArray(texts)) {
                throw new Error(`${ERROR_PREFIX} embedTexts expects an array of strings.`);
            }
            const results = await provider.embedMany(texts.map((text) => ({ text })));
            return results.map((result) => result.vector);
        },
    };
}
export function embeddingProviderToSemantic(provider, modelInfo) {
    validateProvider(provider);
    const providerModelInfo = provider.modelInfo;
    const resolvedModelInfo = {
        provider: modelInfo?.provider ?? providerModelInfo?.provider ?? toEmbeddingProviderId(provider.name),
        model: modelInfo?.model ?? providerModelInfo?.model ?? provider.name,
        dimensions: modelInfo?.dimensions ?? providerModelInfo?.dimensions ?? provider.dimensions,
        normalized: modelInfo?.normalized ?? providerModelInfo?.normalized ?? false,
        maxInputChars: modelInfo?.maxInputChars ?? providerModelInfo?.maxInputChars,
    };
    validateModelInfo(resolvedModelInfo);
    return {
        id: resolvedModelInfo.provider,
        getModelInfo() {
            return resolvedModelInfo;
        },
        async embedOne(input) {
            if (!input || typeof input.text !== "string") {
                throw new Error(`${ERROR_PREFIX} embed input text must be a string.`);
            }
            const embeddings = await provider.embedTexts([input.text]);
            const [vector] = embeddings;
            if (!Array.isArray(vector) || vector.length !== resolvedModelInfo.dimensions) {
                throw new Error(`${ERROR_PREFIX} provider returned an invalid embedding for one input.`);
            }
            return {
                vector,
                model: resolvedModelInfo,
                usage: {
                    estimatedChars: input.text.length,
                },
            };
        },
        async embedMany(inputs) {
            if (!Array.isArray(inputs)) {
                throw new Error(`${ERROR_PREFIX} embedMany inputs must be an array.`);
            }
            const vectors = await provider.embedTexts(inputs.map((input) => input.text));
            validateEmbeddings(vectors, inputs.length, {
                name: provider.name,
                dimensions: resolvedModelInfo.dimensions,
                embedTexts: provider.embedTexts.bind(provider),
            });
            return vectors.map((vector, index) => ({
                vector,
                model: resolvedModelInfo,
                usage: {
                    estimatedChars: inputs[index]?.text.length ?? 0,
                },
            }));
        },
    };
}
export function createEmbeddingProviderRegistry(providers = [new LocalHashEmbeddingsProvider()]) {
    const providersById = new Map();
    for (const provider of providers) {
        if (!provider || typeof provider.getModelInfo !== "function") {
            throw new Error(`${ERROR_PREFIX} semantic provider is required.`);
        }
        if (providersById.has(provider.id)) {
            throw new Error(`${ERROR_PREFIX} duplicate embedding provider "${provider.id}".`);
        }
        validateModelInfo(provider.getModelInfo());
        providersById.set(provider.id, provider);
    }
    return {
        get(providerId) {
            const provider = providersById.get(providerId);
            if (!provider) {
                throw new Error(`${ERROR_PREFIX} unknown embedding provider "${providerId}".`);
            }
            return provider;
        },
        list() {
            return Array.from(providersById.values()).map((provider) => provider.getModelInfo());
        },
    };
}
function validateProvider(provider) {
    if (!provider) {
        throw new Error(`${ERROR_PREFIX} provider is required.`);
    }
    if (typeof provider.name !== "string" || provider.name.trim().length === 0) {
        throw new Error(`${ERROR_PREFIX} provider name must not be empty.`);
    }
    validateDimensions(provider.dimensions);
    if (typeof provider.embedTexts !== "function") {
        throw new Error(`${ERROR_PREFIX} provider must implement embedTexts(texts).`);
    }
}
function validateModelInfo(modelInfo) {
    if (!modelInfo || typeof modelInfo !== "object") {
        throw new Error(`${ERROR_PREFIX} embedding model info is required.`);
    }
    if (!isEmbeddingProviderId(modelInfo.provider)) {
        throw new Error(`${ERROR_PREFIX} embedding model provider is not supported.`);
    }
    if (typeof modelInfo.model !== "string" || modelInfo.model.trim().length === 0) {
        throw new Error(`${ERROR_PREFIX} embedding model name must not be empty.`);
    }
    validateDimensions(modelInfo.dimensions);
    if (typeof modelInfo.normalized !== "boolean") {
        throw new Error(`${ERROR_PREFIX} embedding model normalized flag must be boolean.`);
    }
    if (modelInfo.maxInputChars !== undefined &&
        (!Number.isInteger(modelInfo.maxInputChars) || modelInfo.maxInputChars <= 0)) {
        throw new Error(`${ERROR_PREFIX} maxInputChars must be a positive integer.`);
    }
}
function validateDimensions(dimensions) {
    if (!Number.isInteger(dimensions) || dimensions <= 0) {
        throw new Error(`${ERROR_PREFIX} dimensions must be a positive integer.`);
    }
}
function validateEmbeddings(embeddings, expectedCount, provider) {
    if (!Array.isArray(embeddings)) {
        throw new Error(`${ERROR_PREFIX} provider must return an array of embeddings.`);
    }
    if (embeddings.length !== expectedCount) {
        throw new Error(`${ERROR_PREFIX} provider returned ${embeddings.length} embeddings for ${expectedCount} chunks.`);
    }
    embeddings.forEach((embedding, index) => {
        if (!Array.isArray(embedding)) {
            throw new Error(`${ERROR_PREFIX} embedding at index ${index} must be an array.`);
        }
        if (embedding.length !== provider.dimensions) {
            throw new Error(`${ERROR_PREFIX} embedding at index ${index} has ${embedding.length} dimensions; expected ${provider.dimensions}.`);
        }
        if (embedding.some((value) => !Number.isFinite(value))) {
            throw new Error(`${ERROR_PREFIX} embedding at index ${index} contains a non-finite value.`);
        }
    });
}
function validateOllamaEmbeddingResponse(response, expectedCount, expectedDimensions) {
    if (!response || typeof response !== "object") {
        throw new Error(`${ERROR_PREFIX} ollama embed response must be an object.`);
    }
    const embeddings = response.embeddings;
    if (!Array.isArray(embeddings)) {
        throw new Error(`${ERROR_PREFIX} ollama embed response must include embeddings.`);
    }
    if (embeddings.length !== expectedCount) {
        throw new Error(`${ERROR_PREFIX} ollama returned ${embeddings.length} embeddings for ${expectedCount} inputs.`);
    }
    return embeddings.map((embedding, index) => {
        if (!Array.isArray(embedding)) {
            throw new Error(`${ERROR_PREFIX} ollama embedding at index ${index} must be an array.`);
        }
        if (embedding.length !== expectedDimensions) {
            throw new Error(`${ERROR_PREFIX} ollama embedding at index ${index} has ${embedding.length} dimensions; expected ${expectedDimensions}.`);
        }
        if (embedding.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
            throw new Error(`${ERROR_PREFIX} ollama embedding at index ${index} contains a non-finite value.`);
        }
        return embedding;
    });
}
function validateOpenAiEmbeddingResponse(response, expectedCount, expectedDimensions) {
    if (!response || typeof response !== "object") {
        throw new Error(`${ERROR_PREFIX} openai embed response must be an object.`);
    }
    const items = response.data;
    if (!Array.isArray(items)) {
        throw new Error(`${ERROR_PREFIX} openai embed response must include data.`);
    }
    if (items.length !== expectedCount) {
        throw new Error(`${ERROR_PREFIX} openai returned ${items.length} embeddings for ${expectedCount} inputs.`);
    }
    const byIndex = new Map();
    for (const [position, item] of items.entries()) {
        if (!item || typeof item !== "object") {
            throw new Error(`${ERROR_PREFIX} openai embedding at index ${position} must be an object.`);
        }
        const index = item.index;
        const embedding = item.embedding;
        if (!Number.isInteger(index) || index < 0 || index >= expectedCount) {
            throw new Error(`${ERROR_PREFIX} openai embedding index ${String(index)} is invalid.`);
        }
        if (!Array.isArray(embedding)) {
            throw new Error(`${ERROR_PREFIX} openai embedding at index ${index} must be an array.`);
        }
        if (embedding.length !== expectedDimensions) {
            throw new Error(`${ERROR_PREFIX} openai embedding at index ${index} has ${embedding.length} dimensions; expected ${expectedDimensions}.`);
        }
        if (embedding.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
            throw new Error(`${ERROR_PREFIX} openai embedding at index ${index} contains a non-finite value.`);
        }
        byIndex.set(index, embedding);
    }
    const ordered = [];
    for (let index = 0; index < expectedCount; index += 1) {
        const embedding = byIndex.get(index);
        if (!embedding) {
            throw new Error(`${ERROR_PREFIX} openai embedding at index ${index} is missing.`);
        }
        ordered.push(embedding);
    }
    return ordered;
}
function normalizeOptionalHeaderValue(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
}
function createDeterministicEmbedding(text, dimensions) {
    const vector = Array.from({ length: dimensions }, () => 0);
    const normalizedText = text.normalize("NFKC").toLowerCase();
    if (normalizedText.trim().length === 0) {
        return vector;
    }
    for (let index = 0; index < normalizedText.length; index += 1) {
        const charCode = normalizedText.charCodeAt(index);
        const bucket = (charCode + index * 31) % dimensions;
        const weight = ((charCode % 37) + 1) / 37;
        vector[bucket] += weight;
    }
    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (magnitude === 0) {
        return vector;
    }
    return vector.map((value) => Number((value / magnitude).toFixed(12)));
}
function createLocalHashEmbedding(tokens, dimensions) {
    const vector = Array.from({ length: dimensions }, () => 0);
    if (tokens.length === 0) {
        return vector;
    }
    for (const feature of createLocalHashFeatures(tokens)) {
        const hash = hashString(feature.value);
        const bucket = hash % dimensions;
        const sign = hashString(`sign:${feature.value}`) % 2 === 0 ? 1 : -1;
        vector[bucket] += feature.weight * sign;
    }
    return normalizeVector(vector);
}
function createLocalHashFeatures(tokens) {
    const features = tokens.map((token) => ({
        value: `token:${token}`,
        weight: 1,
    }));
    for (let index = 0; index < tokens.length - 1; index += 1) {
        features.push({
            value: `bigram:${tokens[index]}:${tokens[index + 1]}`,
            weight: 0.75,
        });
    }
    return features;
}
function tokenizeForLocalHash(text) {
    return (text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
        .map(stemLocalHashToken)
        .filter((token) => token.length > 0);
}
function stemLocalHashToken(token) {
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
function normalizeVector(vector) {
    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (magnitude === 0) {
        return vector;
    }
    return vector.map((value) => Number((value / magnitude).toFixed(12)));
}
function hashString(value) {
    let hash = 2_166_136_261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16_777_619);
    }
    return hash >>> 0;
}
function normalizeBaseUrl(baseUrl) {
    if (typeof baseUrl !== "string" || baseUrl.trim().length === 0) {
        throw new Error(`${ERROR_PREFIX} baseUrl must not be empty.`);
    }
    try {
        const parsed = new URL(baseUrl.trim());
        return parsed.toString().replace(/\/$/, "");
    }
    catch {
        throw new Error(`${ERROR_PREFIX} baseUrl must be a valid URL.`);
    }
}
async function readResponseText(response) {
    try {
        return (await response.text()).trim();
    }
    catch {
        return "";
    }
}
function toEmbeddingProviderId(providerName) {
    return isEmbeddingProviderId(providerName) ? providerName : "semantic-placeholder";
}
function isEmbeddingProviderId(value) {
    return (value === "local-hash" ||
        value === "api-lexical" ||
        value === "ollama" ||
    value === "openai" ||
        value === "semantic-placeholder");
}
//# sourceMappingURL=embeddings.js.map