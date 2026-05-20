import { FileSessionMemoryStore } from "@groundedos/memory";
import { CostLedger, TradeoffMetricsStore } from "@groundedos/observability";
import { SemanticCache } from "@groundedos/rag";

export const semanticCache = new SemanticCache();
export const costLedger = new CostLedger();
export const tradeoffMetricsStore = new TradeoffMetricsStore();
export const sessionMemoryStore = new FileSessionMemoryStore(
  process.env.GROUNDEDOS_MEMORY_DIR ?? ".groundedos/memory/sessions"
);
