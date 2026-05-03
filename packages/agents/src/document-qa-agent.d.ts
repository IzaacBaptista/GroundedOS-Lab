/**
 * Document QA Agent
 *
 * Specialized agent for answering questions grounded in document content.
 * Flow:
 * 1. Receives question
 * 2. Calls retrieve-from-index tool to get top-K chunks
 * 3. Calls summarize-with-context tool to generate grounded answer
 * 4. Returns answer + sources + reasoning
 *
 * This is the end-to-end agent flow for Phase 3.
 */
import { BaseAgent } from './agent.js';
export interface DocumentQAAgentConfig {
    id?: string;
    name?: string;
    description?: string;
}
/**
 * DocumentQA Agent - answers questions grounded in indexed documents.
 */
export declare class DocumentQAAgent extends BaseAgent {
    private ragServiceGetterFn;
    constructor(config?: DocumentQAAgentConfig);
    /**
     * Allow injection of RAG service for retrieval.
     */
    setRagService(ragService: any): void;
    /**
     * Override reasoning for document QA: always retrieve first, then summarize.
     */
    protected reasoningStep(input: string, context: any): Promise<{
        reasoning: string;
        toolName: string | null;
        toolInput: Record<string, unknown> | null;
        directAnswer: string | null;
    }>;
}
