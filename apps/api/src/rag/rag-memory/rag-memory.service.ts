import { Injectable } from "@nestjs/common";
import {
  getRagSessionMemory,
  type RagSessionMemoryResponse,
} from "../../rag-service";

@Injectable()
export class RagMemoryService {
  async listSession(
    sessionId: string,
    ownerId?: string,
    tenantId?: string,
    limit?: number
  ): Promise<RagSessionMemoryResponse> {
    return getRagSessionMemory(sessionId, limit, ownerId, tenantId);
  }
}
