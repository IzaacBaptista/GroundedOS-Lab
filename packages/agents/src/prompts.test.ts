import { describe, it, expect } from 'vitest';
import { renderPrompt, PROMPT_TEMPLATES, type PromptTemplate } from './prompts';

describe('renderPrompt', () => {
  it('substitutes all declared variables', () => {
    const template: PromptTemplate = {
      id: 'test',
      description: 'Test template',
      template: 'Hello {name}, you are {age} years old.',
      variables: ['name', 'age'],
    };
    const result = renderPrompt(template, { name: 'Alice', age: '30' });
    expect(result).toBe('Hello Alice, you are 30 years old.');
  });

  it('throws on missing declared variables', () => {
    const template: PromptTemplate = {
      id: 'test',
      description: 'Test template',
      template: 'Hello {name}, topic: {topic}.',
      variables: ['name', 'topic'],
    };
    expect(() => renderPrompt(template, { name: 'Alice' })).toThrow(
      'Missing variables for template "test": topic',
    );
  });

  it('throws when rendered output still has unresolved placeholders', () => {
    // Extra variable in template not declared — still fails
    const template: PromptTemplate = {
      id: 'test',
      description: 'Test template',
      template: 'Hello {name}, also {extra}.',
      variables: ['name'],
    };
    expect(() => renderPrompt(template, { name: 'Alice' })).toThrow(
      'Unresolved template variables',
    );
  });

  it('substitutes the same variable multiple times', () => {
    const template: PromptTemplate = {
      id: 'repeat',
      description: 'Repeat variable test',
      template: '{word} {word} {word}',
      variables: ['word'],
    };
    const result = renderPrompt(template, { word: 'go' });
    expect(result).toBe('go go go');
  });
});

describe('PROMPT_TEMPLATES', () => {
  it('REASONING_STEP has correct id and variables', () => {
    const t = PROMPT_TEMPLATES.REASONING_STEP;
    expect(t.id).toBe('reasoning-step');
    expect(t.variables).toContain('goal');
    expect(t.variables).toContain('input');
    expect(t.variables).toContain('availableTools');
  });

  it('DOCUMENT_QA has correct id and variables', () => {
    const t = PROMPT_TEMPLATES.DOCUMENT_QA;
    expect(t.id).toBe('document-qa');
    expect(t.variables).toContain('retrievedChunks');
    expect(t.variables).toContain('query');
  });

  it('SUMMARIZATION has correct id and variables', () => {
    const t = PROMPT_TEMPLATES.SUMMARIZATION;
    expect(t.id).toBe('summarization');
    expect(t.variables).toContain('language');
    expect(t.variables).toContain('text');
  });

  it('GROUNDING_CHECK has correct id and variables', () => {
    const t = PROMPT_TEMPLATES.GROUNDING_CHECK;
    expect(t.id).toBe('grounding-check');
    expect(t.variables).toContain('context');
    expect(t.variables).toContain('answer');
  });

  it('MULTI_HOP_RESEARCH has correct id and variables', () => {
    const t = PROMPT_TEMPLATES.MULTI_HOP_RESEARCH;
    expect(t.id).toBe('multi-hop-research');
    expect(t.variables).toContain('query');
    expect(t.variables).toContain('accumulatedContext');
    expect(t.variables).toContain('currentHop');
    expect(t.variables).toContain('maxHops');
  });

  it('can render DOCUMENT_QA template correctly', () => {
    const rendered = renderPrompt(PROMPT_TEMPLATES.DOCUMENT_QA, {
      retrievedChunks: 'Chunk A. Chunk B.',
      query: 'What is X?',
    });
    expect(rendered).toContain('Chunk A. Chunk B.');
    expect(rendered).toContain('What is X?');
  });

  it('can render SUMMARIZATION template correctly', () => {
    const rendered = renderPrompt(PROMPT_TEMPLATES.SUMMARIZATION, {
      language: 'pt-BR',
      text: 'Some long text here.',
    });
    expect(rendered).toContain('pt-BR');
    expect(rendered).toContain('Some long text here.');
  });
});
