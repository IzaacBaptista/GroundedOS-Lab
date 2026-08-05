/**
 * Guardrail Setup
 *
 * Shared GuardrailChain instance for the agent execution paths
 * (single-agent, ReAct, multi-agent handoffs, plan execution).
 *
 * Phase 8: this is the first place @groundedos/safety's GuardrailChain is
 * wired into a live agent execution path — /rag/ask does not wire it either
 * (see ADR-015).
 */

import {
  GuardrailChain,
  PromptInjectionGuardrail,
  PIILeakageGuardrail,
  JailbreakGuardrail,
  HallucinationGuardrail,
  PromptLeakageGuardrail,
  IndirectInjectionGuardrail,
} from '@groundedos/safety';
import type { GuardrailChainResult } from '@groundedos/safety';

export function createAgentGuardrailChain(): GuardrailChain {
  const chain = new GuardrailChain();
  chain.register(new PromptInjectionGuardrail());
  chain.register(new PIILeakageGuardrail());
  chain.register(new JailbreakGuardrail());
  chain.register(new HallucinationGuardrail());
  chain.register(new PromptLeakageGuardrail());
  chain.register(new IndirectInjectionGuardrail());
  return chain;
}

/**
 * Check arbitrary agent-produced or agent-received text against the shared
 * guardrail chain. Returns the chain result so callers can decide how to
 * react (reject a handoff, short-circuit a run, etc).
 */
export async function checkAgentText(
  chain: GuardrailChain,
  text: string,
  role: 'user' | 'assistant' = 'assistant',
): Promise<GuardrailChainResult> {
  return chain.check({ text, role });
}
