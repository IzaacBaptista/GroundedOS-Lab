import { describe, it, expect } from 'vitest';
import {
  buildSystemPrompt,
  getPresetInstructions,
  DOCUMENT_QA_INSTRUCTIONS,
  RESEARCH_AGENT_INSTRUCTIONS,
  SAFETY_GUARD_INSTRUCTIONS,
  type InstructionSet,
} from './instructions';

describe('InstructionSet presets', () => {
  it('DOCUMENT_QA_INSTRUCTIONS has required fields', () => {
    expect(DOCUMENT_QA_INSTRUCTIONS.agentId).toBe('document-qa-agent');
    expect(DOCUMENT_QA_INSTRUCTIONS.systemPrompt.length).toBeGreaterThan(10);
    expect(DOCUMENT_QA_INSTRUCTIONS.behaviorRules.length).toBeGreaterThan(0);
  });

  it('RESEARCH_AGENT_INSTRUCTIONS has required fields', () => {
    expect(RESEARCH_AGENT_INSTRUCTIONS.agentId).toBe('research-agent');
    expect(RESEARCH_AGENT_INSTRUCTIONS.systemPrompt.length).toBeGreaterThan(10);
    expect(RESEARCH_AGENT_INSTRUCTIONS.behaviorRules.length).toBeGreaterThan(0);
  });

  it('SAFETY_GUARD_INSTRUCTIONS has required fields', () => {
    expect(SAFETY_GUARD_INSTRUCTIONS.agentId).toBe('safety-guard-agent');
    expect(SAFETY_GUARD_INSTRUCTIONS.systemPrompt.length).toBeGreaterThan(10);
    expect(SAFETY_GUARD_INSTRUCTIONS.behaviorRules.length).toBeGreaterThan(0);
  });
});

describe('getPresetInstructions', () => {
  it('returns preset for document-qa-agent', () => {
    const preset = getPresetInstructions('document-qa-agent');
    expect(preset).toBeDefined();
    expect(preset?.agentId).toBe('document-qa-agent');
  });

  it('returns preset for research-agent', () => {
    const preset = getPresetInstructions('research-agent');
    expect(preset).toBeDefined();
    expect(preset?.agentId).toBe('research-agent');
  });

  it('returns preset for safety-guard-agent', () => {
    const preset = getPresetInstructions('safety-guard-agent');
    expect(preset).toBeDefined();
    expect(preset?.agentId).toBe('safety-guard-agent');
  });

  it('returns undefined for unknown agent ID', () => {
    const preset = getPresetInstructions('unknown-agent-xyz');
    expect(preset).toBeUndefined();
  });
});

describe('buildSystemPrompt', () => {
  it('includes system prompt text', () => {
    const instructions: InstructionSet = {
      agentId: 'test-agent',
      systemPrompt: 'You are a test assistant.',
      behaviorRules: [],
    };
    const prompt = buildSystemPrompt(instructions);
    expect(prompt).toContain('You are a test assistant.');
  });

  it('includes numbered behaviour rules', () => {
    const instructions: InstructionSet = {
      agentId: 'test-agent',
      systemPrompt: 'You are a test assistant.',
      behaviorRules: ['Rule A', 'Rule B', 'Rule C'],
    };
    const prompt = buildSystemPrompt(instructions);
    expect(prompt).toContain('1. Rule A');
    expect(prompt).toContain('2. Rule B');
    expect(prompt).toContain('3. Rule C');
  });

  it('includes output format when specified', () => {
    const instructions: InstructionSet = {
      agentId: 'test-agent',
      systemPrompt: 'You are a test assistant.',
      behaviorRules: [],
      outputFormat: 'Respond with JSON.',
    };
    const prompt = buildSystemPrompt(instructions);
    expect(prompt).toContain('Output format: Respond with JSON.');
  });

  it('includes language when specified', () => {
    const instructions: InstructionSet = {
      agentId: 'test-agent',
      systemPrompt: 'You are a test assistant.',
      behaviorRules: [],
      language: 'pt-BR',
    };
    const prompt = buildSystemPrompt(instructions);
    expect(prompt).toContain('Respond in: pt-BR');
  });

  it('includes few-shot examples when specified', () => {
    const instructions: InstructionSet = {
      agentId: 'test-agent',
      systemPrompt: 'You are a test assistant.',
      behaviorRules: [],
      examples: [{ input: 'What is X?', output: 'X is Y.' }],
    };
    const prompt = buildSystemPrompt(instructions);
    expect(prompt).toContain('Example 1:');
    expect(prompt).toContain('What is X?');
    expect(prompt).toContain('X is Y.');
  });

  it('does not include rules section when behaviorRules is empty', () => {
    const instructions: InstructionSet = {
      agentId: 'test-agent',
      systemPrompt: 'You are a test assistant.',
      behaviorRules: [],
    };
    const prompt = buildSystemPrompt(instructions);
    expect(prompt).not.toContain('Rules:');
  });

  it('builds a valid prompt for DOCUMENT_QA_INSTRUCTIONS', () => {
    const prompt = buildSystemPrompt(DOCUMENT_QA_INSTRUCTIONS);
    expect(prompt).toContain('Document QA');
    expect(prompt).toContain('Rules:');
    expect(prompt).toContain('Output format:');
  });
});
