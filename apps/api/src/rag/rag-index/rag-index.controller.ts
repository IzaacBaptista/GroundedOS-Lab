import { Controller, Delete, Get, Inject, Param } from "@nestjs/common";
import type {
  RagEmbeddingMapResponse,
  RagIndexDeleteResponse,
  RagIndexListResponse,
} from "../../rag-service";
import { RagIndexService } from "./rag-index.service";

@Controller("rag/indexes")
export class RagIndexController {
  constructor(@Inject(RagIndexService) private readonly ragIndex: RagIndexService) {}

  @Get()
  list(): Promise<RagIndexListResponse> {
    return this.ragIndex.list();
  }

  @Get(":documentId/embedding-map")
  embeddingMap(@Param("documentId") documentId: string): Promise<RagEmbeddingMapResponse> {
    return this.ragIndex.embeddingMap(documentId ?? "");
  }

  @Delete(":documentId")
  delete(@Param("documentId") documentId: string): Promise<RagIndexDeleteResponse> {
    return this.ragIndex.delete(documentId ?? "");
  }
}
