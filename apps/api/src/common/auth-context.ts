import type { FastifyRequest } from "fastify";

export type AuthenticatedRequestUser = {
  userId: string;
  username: string;
  roles: string[];
};

export function getRequestUser(request: FastifyRequest): AuthenticatedRequestUser | undefined {
  const candidate = (request as unknown as { user?: unknown }).user;

  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }

  const value = candidate as Partial<AuthenticatedRequestUser>;
  if (
    typeof value.userId !== "string" ||
    typeof value.username !== "string" ||
    !Array.isArray(value.roles)
  ) {
    return undefined;
  }

  return {
    userId: value.userId,
    username: value.username,
    roles: value.roles.filter((role): role is string => typeof role === "string"),
  };
}

export function getRequestUserId(request: FastifyRequest): string | undefined {
  return getRequestUser(request)?.userId;
}
