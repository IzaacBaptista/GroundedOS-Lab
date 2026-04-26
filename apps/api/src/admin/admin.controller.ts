import { Controller, Delete, Get, Inject } from "@nestjs/common";
import type {
  RagAdminClearIndexesResponse,
  RagAdminCostSummaryResponse,
} from "../rag-service";
import { AdminService } from "./admin.service";

@Controller("admin")
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Delete("indexes/all")
  clearIndexes(): Promise<RagAdminClearIndexesResponse> {
    return this.admin.clearAllIndexes();
  }

  @Get("cost/summary")
  getCostSummary(): Promise<RagAdminCostSummaryResponse> {
    return this.admin.getCostSummary();
  }
}
