/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiHttpError } from "./types";
import { listIndexes, login } from "./client";

describe("api client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("preserves HTTP status on API errors", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Authentication required." } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      })
    );

    await expect(listIndexes()).rejects.toMatchObject({
      name: "ApiHttpError",
      message: "Authentication required.",
      status: 401,
    } satisfies Partial<ApiHttpError>);
  });

  it("sends login JSON with same-origin credentials", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresIn: 86400,
        user: { userId: "user-admin", username: "admin", roles: ["admin", "user"] },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    await login({ username: "admin", password: "admin-password" });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        credentials: "same-origin",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "admin-password" }),
      })
    );
  });

  it("uses same-origin credentials for protected requests", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 0, indexes: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    await listIndexes();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/rag/indexes",
      expect.objectContaining({ credentials: "same-origin" })
    );
  });
});
