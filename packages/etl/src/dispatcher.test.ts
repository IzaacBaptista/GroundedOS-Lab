import { describe, expect, it } from "vitest";

import { ingest } from "./dispatcher";
import type { IngestionInput } from "@groundedos/core";

describe("ingest", () => {
  it("routes text input to the text extractor", async () => {
    const doc = await ingest({
      type: "text",
      content: "Intro\n\nDetails",
      metadata: {
        documentId: "doc-1",
        title: "Dispatcher test",
      },
    });

    expect(doc.documentId).toBe("doc-1");
    expect(doc.title).toBe("Dispatcher test");
    expect(doc.modality).toBe("text");
    expect(doc.content.sections).toHaveLength(2);
    expect(doc.content.sections.map((section) => section.text)).toEqual([
      "Intro",
      "Details",
    ]);
  });

  it("throws a clear error when no extractor is registered", async () => {
    const input = {
      type: "csv",
      content: "id,name\n1,Ada",
    } as IngestionInput;

    await expect(ingest(input)).rejects.toThrow(
      'No extractor registered for modality "csv"'
    );
  });

  it("surfaces explicit not-implemented errors from registered stubs", async () => {
    await expect(
      ingest({
        type: "pdf",
        filePath: "sample.pdf",
      })
    ).rejects.toThrow("NOT_IMPLEMENTED");
  });
});
