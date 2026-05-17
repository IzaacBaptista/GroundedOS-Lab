import { Controller, Delete, Get, Inject, Param, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type {
  RagEmbeddingMapResponse,
  RagIndexDeleteResponse,
  RagIndexListResponse,
} from "../../rag-service";
import { getRequestTenantId, getRequestUserId } from "../../common/auth-context";
import { RagIndexService } from "./rag-index.service";

@Controller("rag/indexes")
export class RagIndexController {
  constructor(@Inject(RagIndexService) private readonly ragIndex: RagIndexService) {}

  @Get()
  list(@Req() request: FastifyRequest): Promise<RagIndexListResponse> {
    return this.ragIndex.list(getRequestUserId(request), getRequestTenantId(request));
  }

  @Get(":documentId/embedding-map")
  embeddingMap(
    @Req() request: FastifyRequest,
    @Param("documentId") documentId: string
  ): Promise<RagEmbeddingMapResponse> {
    return this.ragIndex.embeddingMap(
      documentId ?? "",
      getRequestUserId(request),
      getRequestTenantId(request)
    );
  }

  @Delete(":documentId")
  delete(
    @Req() request: FastifyRequest,
    @Param("documentId") documentId: string
  ): Promise<RagIndexDeleteResponse> {
    return this.ragIndex.delete(
      documentId ?? "",
      getRequestUserId(request),
      getRequestTenantId(request)
    );
  }
}
