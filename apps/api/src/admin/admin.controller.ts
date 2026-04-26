import { Body, Controller, Delete, Get, Inject, Param, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type {
  RagAdminClearIndexesResponse,
  RagAdminCostSummaryResponse,
} from "../rag-service";
import { AuditService } from "../audit/audit.service";
import type { AuditEvent } from "../audit/audit-store";
import { getRequestUser } from "../common/auth-context";
import { ApiRequestError } from "../errors";
import { AdminService } from "./admin.service";

type CreateApiKeyRequest = {
  label?: string;
};

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

  @Post("api-keys")
  async createApiKey(
    @Req() request: FastifyRequest,
    @Body() body: CreateApiKeyRequest
  ): Promise<{
    apiKey: string;
    key: {
      id: string;
      keyPrefix: string;
      label?: string;
      userId: string;
      username: string;
      roles: string[];
      createdAt: string;
      expiresAt?: string;
      revokedAt?: string;
    };
  }> {
    const requestUser = getRequestUser(request);
    if (!requestUser) {
      throw new ApiRequestError("Authentication required.", 401);
    }

    const created = await this.admin.createApiKey({
      label: typeof body?.label === "string" ? body.label : undefined,
      user: requestUser,
    });

    await this.audit.record({
      userId: requestUser.userId,
      username: requestUser.username,
      action: "admin.api_key.created",
      resource: "/admin/api-keys",
      metadata: {
        keyId: created.summary.id,
      },
    });

    return {
      apiKey: created.key,
      key: created.summary,
    };
  }

  @Get("api-keys")
  async listApiKeys(
    @Req() request: FastifyRequest
  ): Promise<{
    count: number;
    keys: Array<{
      id: string;
      keyPrefix: string;
      label?: string;
      userId: string;
      username: string;
      roles: string[];
      createdAt: string;
      expiresAt?: string;
      revokedAt?: string;
    }>;
  }> {
    const keys = await this.admin.listApiKeys();
    const requestUser = getRequestUser(request);

    await this.audit.record({
      userId: requestUser?.userId,
      username: requestUser?.username,
      action: "admin.api_key.listed",
      resource: "/admin/api-keys",
      metadata: {
        count: keys.length,
      },
    });

    return {
      count: keys.length,
      keys,
    };
  }

  @Delete("api-keys/:id")
  async revokeApiKey(
    @Req() request: FastifyRequest,
    @Param("id") id: string
  ): Promise<{ revoked: boolean; id: string }> {
    const revoked = await this.admin.revokeApiKey(id);
    const requestUser = getRequestUser(request);

    await this.audit.record({
      userId: requestUser?.userId,
      username: requestUser?.username,
      action: revoked ? "admin.api_key.revoked" : "admin.api_key.revoke_missed",
      resource: `/admin/api-keys/${id}`,
      metadata: {
        keyId: id,
      },
    });

    return {
      revoked,
      id,
    };
  }

  @Post("api-keys/:id/rotate")
  async rotateApiKey(
    @Req() request: FastifyRequest,
    @Param("id") id: string
  ): Promise<{
    rotated: true;
    replacedId: string;
    apiKey: string;
    key: {
      id: string;
      keyPrefix: string;
      label?: string;
      userId: string;
      username: string;
      roles: string[];
      createdAt: string;
      expiresAt?: string;
      revokedAt?: string;
    };
  }> {
    const rotated = await this.admin.rotateApiKey(id);
    if (!rotated) {
      throw new ApiRequestError("API key not found or already inactive.", 404);
    }

    const requestUser = getRequestUser(request);
    await this.audit.record({
      userId: requestUser?.userId,
      username: requestUser?.username,
      action: "admin.api_key.rotated",
      resource: `/admin/api-keys/${id}/rotate`,
      metadata: {
        replacedId: id,
        newId: rotated.summary.id,
      },
    });

    return {
      rotated: true,
      replacedId: id,
      apiKey: rotated.key,
      key: rotated.summary,
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
