import { describe, expect, it, vi } from "vitest";
import { OllamaTextProvider } from "./llm-text-provider";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("OllamaTextProvider", () => {
  it("posts system/user messages to /api/chat and returns the trimmed content", async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ message: { content: "  hello world  " } })
    );
    const provider = new OllamaTextProvider({ fetchFn: fetchFn as unknown as typeof fetch });

    const result = await provider.complete({ system: "sys", user: "usr" });

    expect(result).toBe("hello world");
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toContain("/api/chat");
    const body = JSON.parse(String(init!.body));
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "usr" },
    ]);
  });

  it("throws when the response is not ok", async () => {
    const fetchFn = vi.fn(async () => new Response("boom", { status: 500 }));
    const provider = new OllamaTextProvider({ fetchFn: fetchFn as unknown as typeof fetch });

    await expect(provider.complete({ system: "s", user: "u" })).rejects.toThrow(/failed with status 500/);
  });

  it("throws when the response has no message content", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}));
    const provider = new OllamaTextProvider({ fetchFn: fetchFn as unknown as typeof fetch });

    await expect(provider.complete({ system: "s", user: "u" })).rejects.toThrow(
      /did not include message content/
    );
  });
});
