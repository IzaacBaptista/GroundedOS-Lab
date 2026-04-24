import { Injectable } from "@nestjs/common";
import {
  askRag,
  askRagFromFile,
  indexRag,
  indexRagFromFile,
  type RagAskFileRequest,
  type RagAskRequest,
  type RagAskResponse,
  type RagIndexFileRequest,
  type RagIndexRequest,
  type RagIndexResponse,
} from "../rag-service";
import { ApiConfigService } from "../config/api-config";

/**
 * Thin injectable wrapper around the stateless RAG service functions. Keeping
 * the business logic in {@link ../rag-service.ts} preserves the existing input
 * validation rules (and their exact error messages) that the public API
 * contract — and the integration tests — depend on.
 */
@Injectable()
export class RagService {
  constructor(private readonly config: ApiConfigService) {}

  ask(request: RagAskRequest): Promise<RagAskResponse> {
    return askRag(this.withIndexDir(request));
  }

  askFromFile(request: RagAskFileRequest): Promise<RagAskResponse> {
    return askRagFromFile({ ...request, indexDir: this.config.indexDir });
  }

  index(request: RagIndexRequest): Promise<RagIndexResponse> {
    return indexRag(this.withIndexDir(request));
  }

  indexFromFile(request: RagIndexFileRequest): Promise<RagIndexResponse> {
    return indexRagFromFile({ ...request, indexDir: this.config.indexDir });
  }

  private withIndexDir<T extends { indexDir?: string }>(request: T): T {
    return {
      ...request,
      indexDir: this.config.indexDir,
    };
  }
}
