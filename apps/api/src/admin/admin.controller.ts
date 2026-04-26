import { Controller, Delete, Get, Inject, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type {
  RagAdminClearIndexesResponse,
  RagAdminCostSummaryResponse,
} from "../rag-service";
import { AuditService } from "../audit/audit.service";
import type { AuditEvent } from "../audit/audit-store";
import { getRequestUser } from "../common/auth-context";
import { AdminService } from "./admin.service";

@Controller("admin")
export class AdminController {
  constructor(
    @Inject(AdminService) private readonly admin: AdminService,
    private readonly audit: AuditService
  ) {}

  @Delete("indexes/all")
  async clearIndexes(@Req() request: FastifyRequest): Promise<RagAdminClearIndexesResponse> {
    const result = await this.admin.clearAllIndexes();
    const requestUser = getRequestUser(request);

    await this.audit.record({
      userId: requestUser?.userId,
      username: requestUser?.username,
      action: "admin.indexes.clear_all",
      resource: "/admin/indexes/all",
      metadata: {
        deletedCount: result.deletedCount,
      },
    });

    return result;
  }

  @Get("cost/summary")
  async getCostSummary(@Req() request: FastifyRequest): Promise<RagAdminCostSummaryResponse> {
    const result = await this.admin.getCostSummary();
    const requestUser = getRequestUser(request);

    await this.audit.record({
      userId: requestUser?.userId,
      username: requestUser?.username,
      action: "admin.cost.summary.read",
      resource: "/admin/cost/summary",
    });

    return result;
  }

  @Get("audit/logs")
  async getAuditLogs(
    @Req() request: FastifyRequest,
    @Query("limit") limitValue?: string,
    @Query("action") action?: string,
    @Query("userId") userId?: string
  ): Promise<{ count: number; events: AuditEvent[] }> {
    const limit = parseLimit(limitValue);
    const events = await this.audit.list({
      limit,
      action: normalizeOptionalString(action),
      userId: normalizeOptionalString(userId),
    });

    const requestUser = getRequestUser(request);
    await this.audit.record({
      userId: requestUser?.userId,
      username: requestUser?.username,
      action: "admin.audit.logs.read",
      resource: "/admin/audit/logs",
      metadata: {
        limit,
      },
    });

    return {
      count: events.length,
      events,
    };
  }
}

function parseLimit(limitValue?: string): number {
  const parsed = Number(limitValue);
  if (!Number.isFinite(parsed)) {
    return 100;
  }

  return Math.max(1, Math.min(500, Math.floor(parsed)));
}

function normalizeOptionalString(value?: string): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}
