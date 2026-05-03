import { Inject, Injectable } from "@nestjs/common";
import {
  deletePersistedRagIndex,
  getPersistedRagEmbeddingMap,
  listPersistedRagIndexes,
  type RagEmbeddingMapResponse,
  type RagIndexDeleteResponse,
  type RagIndexListResponse,
} from "../../rag-service";
import { ApiConfigService } from "../../config/api-config";

@Injectable()
export class RagIndexService {
  constructor(@Inject(ApiConfigService) private readonly config: ApiConfigService) {}

  list(ownerId?: string): Promise<RagIndexListResponse> {
    return listPersistedRagIndexes(this.config.indexDir, ownerId);
  }

  embeddingMap(documentId: string, ownerId?: string): Promise<RagEmbeddingMapResponse> {
    return getPersistedRagEmbeddingMap(documentId, this.config.indexDir, ownerId);
  }

  delete(documentId: string, ownerId?: string): Promise<RagIndexDeleteResponse> {
    return deletePersistedRagIndex(documentId, this.config.indexDir, ownerId);
  }
}
