import { Inject, Injectable } from "@nestjs/common";
import {
  clearAllPersistedRagIndexes,
  getRagAdminCostSummary,
  type RagAdminClearIndexesResponse,
  type RagAdminCostSummaryResponse,
} from "../rag-service";
import { ApiConfigService } from "../config/api-config";

@Injectable()
export class AdminService {
  constructor(@Inject(ApiConfigService) private readonly config: ApiConfigService) {}

  clearAllIndexes(): Promise<RagAdminClearIndexesResponse> {
    return clearAllPersistedRagIndexes(this.config.indexDir);
  }

  getCostSummary(): Promise<RagAdminCostSummaryResponse> {
    return getRagAdminCostSummary();
  }
}
