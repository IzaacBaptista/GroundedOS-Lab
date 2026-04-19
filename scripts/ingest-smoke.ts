import { ingest } from "../packages/etl/src/index";

const sampleText = [
  "GroundedOS Lab smoke test.",
  "",
  "This command verifies that the ETL dispatcher can route plain text input and return a NormalizedDocument.",
].join("\n");

const doc = await ingest({
  type: "text",
  content: sampleText,
  metadata: {
    documentId: "smoke-text-001",
    title: "ETL Smoke Test",
    language: "en",
    tags: ["smoke", "phase-0"],
  },
});

console.log(JSON.stringify(doc, null, 2));
