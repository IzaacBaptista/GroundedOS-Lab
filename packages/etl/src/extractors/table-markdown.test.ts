import { describe, expect, it } from "vitest";

import { renderTableAsMarkdown } from "./table-markdown";

describe("renderTableAsMarkdown", () => {
  it("renders rows as a GitHub-flavored markdown table, treating the first row as the header", () => {
    const table = [
      ["Name", "Price", "Qty"],
      ["Widget", "$10", "3"],
      ["Gadget", "$25", "1"],
    ];

    const markdown = renderTableAsMarkdown(table);

    expect(markdown).toBe(
      [
        "| Name | Price | Qty |",
        "| --- | --- | --- |",
        "| Widget | $10 | 3 |",
        "| Gadget | $25 | 1 |",
      ].join("\n")
    );
  });

  it("escapes pipe characters inside cells", () => {
    const markdown = renderTableAsMarkdown([["A|B", "C"], ["1", "2"]]);

    expect(markdown).toContain("A\\|B");
  });

  it("returns an empty string for a table with no rows", () => {
    expect(renderTableAsMarkdown([])).toBe("");
  });

  it("pads ragged rows so every row has the same column count as the header", () => {
    const markdown = renderTableAsMarkdown([["A", "B", "C"], ["1"]]);

    expect(markdown).toBe(["| A | B | C |", "| --- | --- | --- |", "| 1 |  |  |"].join("\n"));
  });
});
