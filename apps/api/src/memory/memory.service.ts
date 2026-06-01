import { Injectable } from "@nestjs/common";
import type {
  FactExtractionResult,
  MemoryCompressionResult,
  MemoryConsolidationResult,
  MemoryHierarchyRequest,
  MemoryHierarchySnapshot,
  MemoryRetrievalResult,
} from "@groundedos/memory";
import { memoryManager } from "../rag-runtime-state";

@Injectable()
export class MemoryService {
  async compress(
    sessionId: string,
    ownerId: string | undefined,
    tenantId: string | undefined,
    request: MemoryHierarchyRequest = {}
  ): Promise<MemoryCompressionResult> {
    return memoryManager.compress(scopeSessionId(sessionId, ownerId, tenantId), request);
  }

  async consolidate(
    sessionId: string,
    ownerId: string | undefined,
    tenantId: string | undefined,
    request: MemoryHierarchyRequest = {}
  ): Promise<MemoryConsolidationResult> {
    return memoryManager.consolidate(scopeSessionId(sessionId, ownerId, tenantId), request);
  }

  async extractFacts(
    sessionId: string,
    ownerId: string | undefined,
    tenantId: string | undefined,
    request: MemoryHierarchyRequest = {}
  ): Promise<FactExtractionResult> {
    return memoryManager.extractFacts(scopeSessionId(sessionId, ownerId, tenantId), request);
  }

  async retrieve(
    sessionId: string,
    query: string,
    ownerId: string | undefined,
    tenantId: string | undefined,
    request: MemoryHierarchyRequest & { limit?: number } = {}
  ): Promise<MemoryRetrievalResult> {
    return memoryManager.retrieve(scopeSessionId(sessionId, ownerId, tenantId), query, request);
  }

  async getHierarchy(
    sessionId: string,
    ownerId: string | undefined,
    tenantId: string | undefined,
    request: MemoryHierarchyRequest = {}
  ): Promise<MemoryHierarchySnapshot> {
    return memoryManager.getHierarchy(scopeSessionId(sessionId, ownerId, tenantId), request);
  }

  async getEpisodes(
    sessionId: string,
    ownerId: string | undefined,
    tenantId: string | undefined,
    request: MemoryHierarchyRequest = {}
  ) {
    const hierarchy = await this.getHierarchy(sessionId, ownerId, tenantId, request);
    return {
      sessionId,
      episodes: hierarchy.episodicMemory.episodes,
      timeline: hierarchy.episodicMemory.timeline,
      graph: hierarchy.episodicMemory.graph,
    };
  }

  async getFacts(
    sessionId: string,
    ownerId: string | undefined,
    tenantId: string | undefined,
    request: MemoryHierarchyRequest = {}
  ) {
    const hierarchy = await this.getHierarchy(sessionId, ownerId, tenantId, request);
    return {
      sessionId,
      facts: hierarchy.longTermMemory.facts,
      conceptIndex: hierarchy.semanticMemory.conceptIndex,
    };
  }

  async getTraces(
    sessionId: string,
    ownerId: string | undefined,
    tenantId: string | undefined,
    request: MemoryHierarchyRequest = {}
  ) {
    const hierarchy = await this.getHierarchy(sessionId, ownerId, tenantId, request);
    return {
      sessionId,
      traces: hierarchy.traces,
    };
  }
}

function scopeSessionId(sessionId: string, ownerId?: string, tenantId?: string): string {
  const normalizedSessionId = sessionId.trim();
  const normalizedOwner = ownerId?.trim();
  const normalizedTenant = tenantId?.trim();

  if (!normalizedTenant && !normalizedOwner) {
    return normalizedSessionId;
  }

  if (!normalizedTenant || !normalizedOwner) {
    return `${normalizedTenant ?? normalizedOwner}__${normalizedSessionId}`;
  }

  return `${normalizedTenant}__${normalizedOwner}__${normalizedSessionId}`;
}
