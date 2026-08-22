import { describe, expect, it } from "vitest";

import { renderStructuredValue } from "./structured-text";

describe("renderStructuredValue", () => {
  it("renders scalar fields as key: value", () => {
    expect(renderStructuredValue({ name: "Ada", age: 36 })).toBe("name: Ada\nage: 36");
  });

  it("renders nested objects with indentation and a header line", () => {
    const value = { customer: { name: "Ada", address: { city: "London" } } };

    expect(renderStructuredValue(value)).toBe(
      ["customer:", "  name: Ada", "  address:", "    city: London"].join("\n")
    );
  });

  it("renders arrays of scalars as a dash list", () => {
    expect(renderStructuredValue({ tags: ["a", "b"] })).toBe("tags:\n  - a\n  - b");
  });

  it("renders arrays of objects with an index header per item", () => {
    const value = { items: [{ id: 1 }, { id: 2 }] };

    expect(renderStructuredValue(value)).toBe(
      ["items:", "  - [0]", "    id: 1", "  - [1]", "    id: 2"].join("\n")
    );
  });

  it("renders empty objects and arrays without crashing", () => {
    expect(renderStructuredValue({ empty: {} })).toBe("empty: (empty object)");
    expect(renderStructuredValue({ empty: [] })).toBe("empty: (empty list)");
  });
});
