import { Controller, Get, Param, Query } from "@nestjs/common";
import type { RagSessionMemoryResponse } from "../../rag-service";
import { RagMemoryService } from "./rag-memory.service";

@Controller("rag/memory")
export class RagMemoryController {
  constructor(private readonly ragMemory: RagMemoryService) {}

  @Get(":sessionId")
  async listSession(
    @Param("sessionId") sessionId: string,
    @Query("limit") limit?: string
  ): Promise<RagSessionMemoryResponse> {
    const parsedLimit =
      typeof limit === "string" && limit.trim().length > 0 ? Number(limit) : undefined;

    return this.ragMemory.listSession(
      sessionId,
      Number.isInteger(parsedLimit) && parsedLimit! > 0 ? parsedLimit : undefined
    );
  }
}
