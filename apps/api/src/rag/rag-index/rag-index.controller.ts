import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type {
  RagEmbeddingMapResponse,
  RagIndexDeleteResponse,
  RagIndexListResponse,
  RagIndexRollbackResponse,
  RagIndexVersionsResponse,
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

  @Get(":documentId/versions")
  versions(
    @Req() request: FastifyRequest,
    @Param("documentId") documentId: string
  ): Promise<RagIndexVersionsResponse> {
    return this.ragIndex.versions(
      documentId ?? "",
      getRequestUserId(request),
      getRequestTenantId(request)
    );
  }

  @Post(":documentId/rollback/:versionId")
  @HttpCode(HttpStatus.OK)
  rollback(
    @Req() request: FastifyRequest,
    @Param("documentId") documentId: string,
    @Param("versionId") versionId: string
  ): Promise<RagIndexRollbackResponse> {
    return this.ragIndex.rollback(
      documentId ?? "",
      versionId ?? "",
      getRequestUserId(request),
      getRequestTenantId(request)
    );
  }
}
