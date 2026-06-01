import { Body, Controller, Get, Inject, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { MemoryHierarchyRequest } from "@groundedos/memory";
import { getRequestTenantId, getRequestUserId } from "../common/auth-context";
import { MemoryService } from "./memory.service";

type MemoryMutationBody = MemoryHierarchyRequest & {
  sessionId: string;
  query?: string;
  limit?: number;
};

@Controller("memory")
export class MemoryController {
  constructor(@Inject(MemoryService) private readonly memory: MemoryService) {}

  @Post("compress")
  compress(@Req() request: FastifyRequest, @Body() body: MemoryMutationBody) {
    return this.memory.compress(
      body.sessionId,
      getRequestUserId(request),
      getRequestTenantId(request),
      body
    );
  }

  @Post("consolidate")
  consolidate(@Req() request: FastifyRequest, @Body() body: MemoryMutationBody) {
    return this.memory.consolidate(
      body.sessionId,
      getRequestUserId(request),
      getRequestTenantId(request),
      body
    );
  }

  @Post("extract-facts")
  extractFacts(@Req() request: FastifyRequest, @Body() body: MemoryMutationBody) {
    return this.memory.extractFacts(
      body.sessionId,
      getRequestUserId(request),
      getRequestTenantId(request),
      body
    );
  }

  @Post("retrieve")
  retrieve(@Req() request: FastifyRequest, @Body() body: MemoryMutationBody) {
    return this.memory.retrieve(
      body.sessionId,
      body.query ?? "",
      getRequestUserId(request),
      getRequestTenantId(request),
      body
    );
  }

  @Get("episodes")
  getEpisodes(
    @Req() request: FastifyRequest,
    @Query("sessionId") sessionId: string,
    @Query("memoryWindow") memoryWindow?: string
  ) {
    return this.memory.getEpisodes(
      sessionId,
      getRequestUserId(request),
      getRequestTenantId(request),
      {
        memoryWindow: normalizeOptionalNumber(memoryWindow),
      }
    );
  }

  @Get("facts")
  getFacts(@Req() request: FastifyRequest, @Query("sessionId") sessionId: string) {
    return this.memory.getFacts(sessionId, getRequestUserId(request), getRequestTenantId(request));
  }

  @Get("traces")
  getTraces(@Req() request: FastifyRequest, @Query("sessionId") sessionId: string) {
    return this.memory.getTraces(sessionId, getRequestUserId(request), getRequestTenantId(request));
  }

  @Get("hierarchy")
  getHierarchy(
    @Req() request: FastifyRequest,
    @Query("sessionId") sessionId: string,
    @Query("query") query?: string
  ) {
    return this.memory.getHierarchy(
      sessionId,
      getRequestUserId(request),
      getRequestTenantId(request),
      { query }
    );
  }
}

function normalizeOptionalNumber(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
