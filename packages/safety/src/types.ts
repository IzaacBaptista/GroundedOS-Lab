/**
 * Guardrail Types
 *
 * Defines the Guardrail interface and related types.
 * All safety checks implement this contract.
 */

export interface GuardrailInput {
  text: string;
  role: 'user' | 'assistant';
  metadata?: Record<string, unknown>;
}

export interface GuardrailResult {
  blocked: boolean;
  reason?: string;
  sanitized?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  detectedPatterns?: string[];
}

export interface Guardrail {
  readonly name: string;
  readonly riskType:
    | 'prompt-injection'
    | 'pii-leakage'
    | 'jailbreak'
    | 'hallucination'
    | 'prompt-leakage'
    | 'indirect-injection';

  /**
   * Check input against this guardrail.
   * Returns blocked=true if the input violates the rule.
   * Returns sanitized text if the guardrail should modify (not block).
   */
  check(input: GuardrailInput): Promise<GuardrailResult>;
}

export interface GuardrailConfig {
  enabled: boolean;
  strict: boolean; // If true, block on detection; if false, only sanitize
  blockThreshold?: number; // 0.0-1.0 confidence threshold
}

export interface GuardrailChainResult {
  passed: boolean;
  blockedBy?: string;
  reason?: string;
  sanitized: string;
  allResults: Map<string, GuardrailResult>;
}

/**
 * Common patterns for detecting injection attempts.
 */
export const PROMPT_INJECTION_PATTERNS = [
  /ignore.*previous.*instructions/i,
  /forget.*previous.*prompt/i,
  /system.*prompt/i,
  /skip.*to.*next/i,
  /\[inst\]/i,
  /\[\/inst\]/i,
  /<system>/i,
  /<\/system>/i,
  /role.*switch/i,
  /act.*as/i,
  /pretend.*to.*be/i,
  /jailbreak/i,
  /do.*anything.*now/i,
];

/**
 * Common PII patterns (simplified; production should use more comprehensive detection).
 */
export const PII_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  cpf: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, // Brazilian CPF
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g, // US SSN
  creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
};

/**
 * Jailbreak patterns (role override, capability claiming, etc.)
 */
export const JAILBREAK_PATTERNS = [
  /you.*are.*now/i,
  /forget.*who.*you.*are/i,
  /no.*longer.*bound/i,
  /pretend.*you.*don't.*know/i,
  /as.*an.*ai.*you.*should/i,
  /let's.*roleplay/i,
  /simulate.*being/i,
];
