import { Inject, Injectable } from "@nestjs/common";
import {
  deletePersistedRagIndex,
  getPersistedRagEmbeddingMap,
  listPersistedRagIndexes,
  listPersistedRagIndexVersions,
  rollbackPersistedRagIndex,
  type RagEmbeddingMapResponse,
  type RagIndexDeleteResponse,
  type RagIndexListResponse,
  type RagIndexRollbackResponse,
  type RagIndexVersionsResponse,
} from "../../rag-service";
import { ApiConfigService } from "../../config/api-config";

@Injectable()
export class RagIndexService {
  constructor(@Inject(ApiConfigService) private readonly config: ApiConfigService) {}

  list(ownerId?: string, tenantId?: string): Promise<RagIndexListResponse> {
    return listPersistedRagIndexes(this.config.indexDir, ownerId, tenantId);
  }

  embeddingMap(
    documentId: string,
    ownerId?: string,
    tenantId?: string
  ): Promise<RagEmbeddingMapResponse> {
    return getPersistedRagEmbeddingMap(documentId, this.config.indexDir, ownerId, tenantId);
  }

  delete(documentId: string, ownerId?: string, tenantId?: string): Promise<RagIndexDeleteResponse> {
    return deletePersistedRagIndex(documentId, this.config.indexDir, ownerId, tenantId);
  }

  versions(
    documentId: string,
    ownerId?: string,
    tenantId?: string
  ): Promise<RagIndexVersionsResponse> {
    return listPersistedRagIndexVersions(documentId, this.config.indexDir, ownerId, tenantId);
  }

  rollback(
    documentId: string,
    versionId: string,
    ownerId?: string,
    tenantId?: string
  ): Promise<RagIndexRollbackResponse> {
    return rollbackPersistedRagIndex(
      documentId,
      versionId,
      this.config.indexDir,
      ownerId,
      tenantId
    );
  }
}
