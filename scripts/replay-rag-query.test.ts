import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TraceStore } from "../apps/api/src/observability/trace-store";
import {
  askPersistedRag,
  indexRag,
} from "../apps/api/src/rag-service";
import { createTempDir, makeRagTestCase, resetRagRuntimeState } from "@groundedos/test-harness";
import { runReplayCli } from "./replay-rag-query";

const originalObservabilityDir = process.env.GROUNDEDOS_OBSERVABILITY_DIR;

beforeEach(async () => {
  await resetRagRuntimeState();
});

afterEach(async () => {
  if (originalObservabilityDir === undefined) {
    delete process.env.GROUNDEDOS_OBSERVABILITY_DIR;
  } else {
    process.env.GROUNDEDOS_OBSERVABILITY_DIR = originalObservabilityDir;
  }
});

describe("replay-rag-query script", () => {
  it("creates a snapshot from a historical trace", async () => {
    const fixture = await createReplayFixture();
    const snapshotOut = join(fixture.root, "snapshot.json");

    const result = await runReplayCli({
      traceId: "trace-test-1",
      snapshotOut,
      outputPath: join(fixture.root, "unused-report.json"),
      createOnly: true,
      help: false,
    });

    const saved = JSON.parse(await readFile(snapshotOut, "utf-8")) as { query: string };

    expect(result.snapshot?.query).toBe("What explains vector search?");
    expect(saved.query).toBe("What explains vector search?");
  });

  it("executes replay from a stored snapshot file", async () => {
    const fixture = await createReplayFixture();
    const snapshotPath = join(fixture.root, "snapshot.json");
    const outputPath = join(fixture.root, "report.json");

    await writeFile(snapshotPath, JSON.stringify(fixture.snapshot, null, 2));

    const result = await runReplayCli({
      snapshotFile: snapshotPath,
      outputPath,
      createOnly: false,
      help: false,
    });

    const saved = JSON.parse(await readFile(outputPath, "utf-8")) as { status: string };

    expect(result.report?.status).toBe("matched");
    expect(saved.status).toBe("matched");
  });
});

async function createReplayFixture(): Promise<{
  root: string;
  snapshot: NonNullable<Awaited<ReturnType<typeof askPersistedRag>>["devMode"]["replay"]>["snapshot"];
}> {
  const root = await createTempDir("groundedos-replay-cli-test-");
  const indexDir = join(root, "indexes");
  const observabilityDir = join(root, "observability");
  const testCase = makeRagTestCase({
    title: "Replay CLI Test",
    documentId: "replay-cli-doc",
  });
  process.env.GROUNDEDOS_OBSERVABILITY_DIR = observabilityDir;

  await indexRag({
    ...testCase,
    indexDir,
  });
  const original = await askPersistedRag({
    documentId: testCase.documentId,
    query: testCase.query,
    topK: testCase.topK,
    indexDir,
  });

  const snapshot = {
    ...original.devMode.replay!.snapshot,
    correlation: {
      ...original.devMode.replay!.snapshot.correlation,
      traceId: "trace-test-1",
      requestId: "request-test-1",
    },
  };

  await new TraceStore(observabilityDir).append({
    version: "v1",
    timestamp: new Date().toISOString(),
    component: "retrieval",
    operation: "rag.pipeline",
    status: "success",
    durationMs: 10,
    correlation: {
      traceId: "trace-test-1",
      requestId: "request-test-1",
      indexId: "replay-cli-doc",
    },
    metadata: {
      replay: {
        reproducible: true,
        command: "npm run rag:replay -- --trace-id trace-test-1",
        mode: "persisted",
        snapshot,
      },
    },
  });

  return {
    root,
    snapshot,
  };
}
