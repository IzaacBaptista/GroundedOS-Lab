import { Controller, Delete, Get, Param } from "@nestjs/common";
import type {
  RagIndexDeleteResponse,
  RagIndexListResponse,
} from "../../rag-service";
import { RagIndexService } from "./rag-index.service";

@Controller("rag/indexes")
export class RagIndexController {
  constructor(private readonly ragIndex: RagIndexService) {}

  @Get()
  list(): Promise<RagIndexListResponse> {
    return this.ragIndex.list();
  }

  @Delete(":documentId")
  delete(@Param("documentId") documentId: string): Promise<RagIndexDeleteResponse> {
    return this.ragIndex.delete(documentId ?? "");
  }
}
