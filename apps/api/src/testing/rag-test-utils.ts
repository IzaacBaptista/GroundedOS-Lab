import {
  semanticCache,
  sessionMemoryStore,
  tradeoffMetricsStore,
} from "../rag-runtime-state";

export async function resetRagRuntimeState(): Promise<void> {
  semanticCache.clear();
  tradeoffMetricsStore.clear();
  await sessionMemoryStore.clearAll();
}
