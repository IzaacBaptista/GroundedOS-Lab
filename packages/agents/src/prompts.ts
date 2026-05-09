/**
 * Agent Prompt Templates
 *
 * Provides a lightweight template system for composing dynamic LLM prompts.
 * Templates use {variableName} placeholders that are resolved at render time.
 *
 * This module also exports the canonical prompt templates used across the
 * agent pipeline (reasoning, document QA, summarisation, grounding check).
 */

// ---------------------------------------------------------------------------
// Core interface
// ---------------------------------------------------------------------------

export interface PromptTemplate {
  /** Unique identifier for this template. */
  id: string;

  /** Human-readable description of what this template produces. */
  description: string;

  /**
   * The raw template string.
   * Placeholders are written as `{variableName}` and resolved by `renderPrompt`.
   */
  template: string;

  /**
   * Ordered list of variable names that MUST be supplied to `renderPrompt`.
   * Checked at render time to surface missing variables early.
   */
  variables: string[];
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Render a PromptTemplate by substituting all `{variable}` placeholders with
 * the values supplied in `vars`.
 *
 * Throws if any declared variable is missing from `vars`, or if the rendered
 * string still contains unresolved placeholders after substitution.
 */
export function renderPrompt(
  template: PromptTemplate,
  vars: Record<string, string>,
): string {
  // Validate all declared variables are provided
  const missing = template.variables.filter((v) => !(v in vars));
  if (missing.length > 0) {
    throw new Error(
      `Missing variables for template "${template.id}": ${missing.join(', ')}`,
    );
  }

  // Substitute placeholders
  let rendered = template.template;
  for (const [key, value] of Object.entries(vars)) {
    rendered = rendered.replaceAll(`{${key}}`, value);
  }

  // Detect any remaining unresolved placeholders
  const unresolved = rendered.match(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g);
  if (unresolved) {
    throw new Error(
      `Unresolved template variables in "${template.id}": ${unresolved.join(', ')}`,
    );
  }

  return rendered;
}

// ---------------------------------------------------------------------------
// Built-in templates
// ---------------------------------------------------------------------------

/**
 * Step-by-step reasoning template used in the agent tool-calling decision loop.
 * Extracted and generalised from the original DEEP_REASONING_PROMPT_TEMPLATE
 * in agent.ts.
 */
const REASONING_STEP: PromptTemplate = {
  id: 'reasoning-step',
  description:
    'Step-by-step reasoning template that guides the agent in deciding whether to call a tool.',
  template: `You are an AI agent with a specific goal and access to tools.

Goal: {goal}

Task: {input}

{availableTools}

Think through this step by step:
1. What is the user asking for?
2. Do I need to call any tools to answer?
3. If yes, which tool and with what input?
4. Once I have the result, how do I answer based on the retrieved context?

Respond in this exact JSON format:
{
  "reasoning": "Your step-by-step reasoning",
  "shouldCallTool": boolean,
  "toolName": "tool_name_if_applicable" or null,
  "toolInput": { extracted input } or null,
  "answer": "Your final answer if no tool needed" or null
}`,
  variables: ['goal', 'input', 'availableTools'],
};

/**
 * Document QA template: produces a grounded answer from retrieved chunks.
 */
const DOCUMENT_QA: PromptTemplate = {
  id: 'document-qa',
  description: 'Grounds an answer in retrieved document chunks.',
  template: `Context from retrieved documents:
{retrievedChunks}

Question: {query}

Answer grounded in the provided context:`,
  variables: ['retrievedChunks', 'query'],
};

/**
 * Summarisation template: condenses a text body in the specified language.
 */
const SUMMARIZATION: PromptTemplate = {
  id: 'summarization',
  description: 'Summarises a body of text in the specified language.',
  template: `Summarise the following content in {language}:

{text}

Summary:`,
  variables: ['language', 'text'],
};

/**
 * Grounding check template: verifies whether an answer is supported by context.
 */
const GROUNDING_CHECK: PromptTemplate = {
  id: 'grounding-check',
  description:
    'Checks whether a generated answer is fully grounded in the provided context.',
  template: `Does the following answer follow only from the provided context?

Context:
{context}

Answer:
{answer}

Respond with JSON: { "grounded": boolean, "confidence": number, "unsupportedClaims": string[] }`,
  variables: ['context', 'answer'],
};

/**
 * Multi-hop research template: iteratively decomposes a complex query into
 * sub-queries for exploration across multiple sources.
 */
const MULTI_HOP_RESEARCH: PromptTemplate = {
  id: 'multi-hop-research',
  description:
    'Decomposes a complex research question into focused sub-queries for multi-hop retrieval.',
  template: `You are a research agent decomposing a complex question for multi-hop retrieval.

Original question: {query}

Retrieved context so far:
{accumulatedContext}

Hop {currentHop} of {maxHops}.

Decide:
1. Is the current context sufficient to answer the original question?
2. If not, what specific sub-query should be sent next to retrieve missing information?

Respond with JSON: { "sufficient": boolean, "nextSubQuery": string | null, "partialAnswer": string | null }`,
  variables: ['query', 'accumulatedContext', 'currentHop', 'maxHops'],
};

/**
 * Canonical prompt templates registry.
 * Import the `PROMPT_TEMPLATES` object and pick the template you need.
 */
export const PROMPT_TEMPLATES = {
  REASONING_STEP,
  DOCUMENT_QA,
  SUMMARIZATION,
  GROUNDING_CHECK,
  MULTI_HOP_RESEARCH,
} as const satisfies Record<string, PromptTemplate>;
