import { Controller, Get, Inject, Param, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { RagSessionMemoryResponse } from "../../rag-service";
import { getRequestUserId } from "../../common/auth-context";
import { RagMemoryService } from "./rag-memory.service";

@Controller("rag/memory")
export class RagMemoryController {
  constructor(@Inject(RagMemoryService) private readonly ragMemory: RagMemoryService) {}

  @Get(":sessionId")
  async listSession(
    @Req() request: FastifyRequest,
    @Param("sessionId") sessionId: string,
    @Query("limit") limit?: string
  ): Promise<RagSessionMemoryResponse> {
    const parsedLimit =
      typeof limit === "string" && limit.trim().length > 0 ? Number(limit) : undefined;

    return this.ragMemory.listSession(
      sessionId,
      getRequestUserId(request),
      Number.isInteger(parsedLimit) && parsedLimit! > 0 ? parsedLimit : undefined
    );
  }
}
