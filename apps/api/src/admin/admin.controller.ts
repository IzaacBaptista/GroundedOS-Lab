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
    @Query("cursor") cursorValue?: string,
    @Query("action") action?: string,
    @Query("userId") userId?: string
  ): Promise<{ count: number; nextCursor?: string; events: AuditEvent[] }> {
    const limit = parseLimit(limitValue);
    const offset = parseCursor(cursorValue);
    const probeLimit = Math.min(500, limit + 1);
    const events = await this.audit.list({
      limit: probeLimit,
      offset,
      action: normalizeOptionalString(action),
      userId: normalizeOptionalString(userId),
    });
    const hasMore = events.length > limit;
    const items = hasMore ? events.slice(0, limit) : events;

    const requestUser = getRequestUser(request);
    await this.audit.record({
      userId: requestUser?.userId,
      username: requestUser?.username,
      action: "admin.audit.logs.read",
      resource: "/admin/audit/logs",
      metadata: {
        limit,
        offset,
      },
    });

    return {
      count: items.length,
      nextCursor: hasMore ? encodeCursor(offset + items.length) : undefined,
      events: items,
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
    @Req() request: FastifyRequest,
    @Query("limit") limitValue?: string,
    @Query("cursor") cursorValue?: string
  ): Promise<{
    count: number;
    nextCursor?: string;
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
    const limit = parseLimit(limitValue);
    const offset = parseCursor(cursorValue);
    const allKeys = await this.admin.listApiKeys();
    const page = allKeys.slice(offset, offset + limit + 1);
    const hasMore = page.length > limit;
    const keys = hasMore ? page.slice(0, limit) : page;
    const requestUser = getRequestUser(request);

    await this.audit.record({
      userId: requestUser?.userId,
      username: requestUser?.username,
      action: "admin.api_key.listed",
      resource: "/admin/api-keys",
      metadata: {
        count: keys.length,
        limit,
        offset,
      },
    });

    return {
      count: keys.length,
      nextCursor: hasMore ? encodeCursor(offset + keys.length) : undefined,
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

function parseCursor(value?: string): number {
  if (!value) {
    return 0;
  }

  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const parsed = Number(decoded);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }

    return Math.floor(parsed);
  } catch {
    return 0;
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(Math.max(0, Math.floor(offset))), "utf8").toString("base64url");
}
