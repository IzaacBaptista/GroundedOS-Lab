/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import App from "./App";

/**
 * Basic smoke test for the React console. Network calls to `/api/*` are
 * stubbed so the component can mount without a backend.
 */
describe("App", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/api/health")) {
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.endsWith("/api/rag/indexes")) {
        return new Response(JSON.stringify({ count: 0, indexes: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: { message: "unhandled" } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders the Local RAG Console header and empty state", async () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /local rag console/i })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /ask/i })).toBeTruthy();

    // Empty index list means the select shows "No indexed documents".
    await waitFor(() => {
      expect(screen.getByText(/no indexed documents/i)).toBeTruthy();
    });

    // Health check resolves "online" after the first successful fetch.
    await waitFor(() => {
      expect(screen.getByText(/api online/i)).toBeTruthy();
    });
  });

  it("shows a validation error when submitting without a query", async () => {
    const { container } = render(<App />);
    const form = container.querySelector("form");

    if (!form) {
      throw new Error("form not rendered");
    }

    // HTMLFormElement.requestSubmit triggers onSubmit without native
    // constraint validation interrupting the handler.
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));

    await waitFor(() => {
      const matches = screen.getAllByText(/question is required/i);
      expect(matches.length).toBeGreaterThan(0);
    });
  });
});
