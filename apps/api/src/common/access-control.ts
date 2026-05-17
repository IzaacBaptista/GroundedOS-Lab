import { ApiRequestError } from "../errors";
import type { AuthenticatedRequestUser } from "./auth-context";

export type OwnershipContext = {
  tenantId: string;
  userId: string;
  createdBy: string;
};

const FALLBACK_ANONYMOUS_ID = "anonymous";

export function resolveOwnershipContext(user: AuthenticatedRequestUser | undefined): OwnershipContext {
  const tenantId = normalizeOwnershipId(user?.tenantId);
  const userId = normalizeOwnershipId(user?.userId);
  return {
    tenantId,
    userId,
    createdBy: userId,
  };
}

export function resolveRequiredApiKeyScopes(method: string, path: string): string[] {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = path.split("?")[0] ?? "/";

  if (normalizedPath.startsWith("/admin")) {
    return ["admin:full"];
  }

  if (normalizedPath === "/rag/index" && normalizedMethod === "POST") {
    return ["rag:ingest"];
  }

  if (normalizedPath === "/rag/ask" && normalizedMethod === "POST") {
    return ["rag:read"];
  }

  if (normalizedPath.startsWith("/rag/indexes")) {
    if (normalizedMethod === "DELETE") {
      return ["rag:delete"];
    }
    return ["rag:read"];
  }

  if (normalizedPath.startsWith("/rag/memory") && normalizedMethod === "GET") {
    return ["rag:read"];
  }

  if (normalizedPath.startsWith("/jobs") && normalizedMethod === "POST") {
    return ["jobs:enqueue"];
  }

  if (normalizedPath.startsWith("/jobs") && normalizedMethod === "GET") {
    return ["jobs:read"];
  }

  return [];
}

export function ensureApiKeyScopes(
  user: AuthenticatedRequestUser,
  requiredScopes: string[],
  operation: string
): void {
  if (user.authType !== "api_key" || requiredScopes.length === 0) {
    return;
  }

  const grantedScopes = new Set(user.apiKeyScopes ?? []);
  if (grantedScopes.has("*")) {
    return;
  }

  const allowed = requiredScopes.some((scope) => grantedScopes.has(scope));
  if (!allowed) {
    throw new ApiRequestError(`API key does not have permission for ${operation}.`, 403);
  }
}

function normalizeOwnershipId(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    return FALLBACK_ANONYMOUS_ID;
  }
  return normalized;
}
