import { Inject, Injectable } from "@nestjs/common";
import {
  clearAllPersistedRagIndexes,
  getRagAdminCostSummary,
  type RagAdminClearIndexesResponse,
  type RagAdminCostSummaryResponse,
} from "../rag-service";
import { ApiConfigService } from "../config/api-config";
import { AuthService, type ApiKeySummary, type AuthUser, type CreatedApiKey } from "../auth/auth.service";

@Injectable()
export class AdminService {
  constructor(
    @Inject(ApiConfigService) private readonly config: ApiConfigService,
    private readonly authService: AuthService
  ) {}

  clearAllIndexes(): Promise<RagAdminClearIndexesResponse> {
    return clearAllPersistedRagIndexes(this.config.indexDir);
  }

  getCostSummary(): Promise<RagAdminCostSummaryResponse> {
    return getRagAdminCostSummary();
  }

  createApiKey(input: { label?: string; user: AuthUser }): Promise<CreatedApiKey> {
    return this.authService.createApiKey(input);
  }

  listApiKeys(): Promise<ApiKeySummary[]> {
    return this.authService.listApiKeys();
  }

  revokeApiKey(id: string): Promise<boolean> {
    return this.authService.revokeApiKey(id);
  }

  rotateApiKey(id: string): Promise<CreatedApiKey | null> {
    return this.authService.rotateApiKey(id);
  }
}
