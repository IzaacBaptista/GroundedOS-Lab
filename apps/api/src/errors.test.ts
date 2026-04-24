import { describe, expect, it } from "vitest";

import { ApiRequestError } from "./errors";

describe("ApiRequestError", () => {
  it("creates an error with the given message and default statusCode of 400", () => {
    const error = new ApiRequestError("Something went wrong.");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error.message).toBe("Something went wrong.");
    expect(error.statusCode).toBe(400);
    expect(error.name).toBe("ApiRequestError");
  });

  it("accepts a custom statusCode", () => {
    const notFound = new ApiRequestError("Resource not found.", 404);
    const serverError = new ApiRequestError("Internal failure.", 500);
    const unsupported = new ApiRequestError("Unsupported media type.", 415);

    expect(notFound.statusCode).toBe(404);
    expect(serverError.statusCode).toBe(500);
    expect(unsupported.statusCode).toBe(415);
  });

  it("is recognisable with instanceof checks", () => {
    const error = new ApiRequestError("test");

    expect(error instanceof Error).toBe(true);
    expect(error instanceof ApiRequestError).toBe(true);
  });

  it("captures a stack trace", () => {
    const error = new ApiRequestError("trace test");

    expect(error.stack).toContain("ApiRequestError");
  });
});
