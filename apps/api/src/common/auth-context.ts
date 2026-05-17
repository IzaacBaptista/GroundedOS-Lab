import type { FastifyRequest } from "fastify";

export type AuthenticatedRequestUser = {
  tenantId: string;
  userId: string;
  username: string;
  roles: string[];
  authType?: "access_token" | "api_key";
  apiKeyId?: string;
  apiKeyScopes?: string[];
  requestId?: string;
};

export function getRequestUser(request: FastifyRequest): AuthenticatedRequestUser | undefined {
  const candidate = (request as unknown as { user?: unknown }).user;

  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }

  const value = candidate as Partial<AuthenticatedRequestUser>;
  if (
    typeof value.tenantId !== "string" ||
    typeof value.userId !== "string" ||
    typeof value.username !== "string" ||
    !Array.isArray(value.roles)
  ) {
    return undefined;
  }

  return {
    tenantId: value.tenantId,
    userId: value.userId,
    username: value.username,
    roles: value.roles.filter((role): role is string => typeof role === "string"),
    authType:
      value.authType === "access_token" || value.authType === "api_key"
        ? value.authType
        : undefined,
    apiKeyId: typeof value.apiKeyId === "string" ? value.apiKeyId : undefined,
    apiKeyScopes: Array.isArray(value.apiKeyScopes)
      ? value.apiKeyScopes.filter((scope): scope is string => typeof scope === "string")
      : undefined,
    requestId: typeof value.requestId === "string" ? value.requestId : undefined,
  };
}

export function getRequestUserId(request: FastifyRequest): string | undefined {
  return getRequestUser(request)?.userId;
}

export function getRequestTenantId(request: FastifyRequest): string | undefined {
  return getRequestUser(request)?.tenantId;
}
