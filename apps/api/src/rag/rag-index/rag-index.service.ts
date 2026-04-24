import { Inject, Injectable } from "@nestjs/common";
import {
  deletePersistedRagIndex,
  listPersistedRagIndexes,
  type RagIndexDeleteResponse,
  type RagIndexListResponse,
} from "../../rag-service";
import { ApiConfigService } from "../../config/api-config";

@Injectable()
export class RagIndexService {
  constructor(@Inject(ApiConfigService) private readonly config: ApiConfigService) {}

  list(): Promise<RagIndexListResponse> {
    return listPersistedRagIndexes(this.config.indexDir);
  }

  delete(documentId: string): Promise<RagIndexDeleteResponse> {
    return deletePersistedRagIndex(documentId, this.config.indexDir);
  }
}
