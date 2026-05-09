import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

function runTsxScript(scriptPath: string, args: string[] = []): string {
  try {
    return execFileSync(
      process.execPath,
      ["--import", "tsx", scriptPath, ...args],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
  } catch (error) {
    if (error instanceof Error && "stdout" in error) {
      return (error as { stdout: string }).stdout;
    }
    throw error;
  }
}

describe("instruction layer scripts", () => {
  it("check script passes for current workspace state", () => {
    const output = runTsxScript("scripts/check-instruction-layer.ts");
    expect(output).toContain("Instruction layer check passed.");
  });

  it("migration planner defaults to current version", () => {
    const output = runTsxScript("scripts/plan-instruction-schema-migration.ts");
    const policy = parse(
      readFileSync("instructions/schema/migration-policy.yaml", "utf8")
    ) as { current_version: string };

    const plan = JSON.parse(output) as {
      fromVersion: string;
      toVersion: string;
      transitionMode: string;
      impactedFileCount: number;
    };

    expect(plan.fromVersion).toBe(policy.current_version);
    expect(plan.toVersion).toBe(policy.current_version);
    expect(plan.transitionMode).toBe("noop");
    expect(plan.impactedFileCount).toBeGreaterThan(0);
  });

  it("deprecation report runs without crashing", () => {
    const output = runTsxScript("scripts/report-instruction-deprecations.ts");
    expect(output.length).toBeGreaterThan(0);
    // Either shows report header or indicates no deprecated entries
    expect(
      output.includes("Instruction Layer Deprecation Report") || output.includes("No deprecated instruction-layer entries found")
    ).toBe(true);
  });

  it("resolver generates bundles for all consumers", () => {
    const output = runTsxScript("scripts/resolve-instruction-layer.ts");
    expect(output).toContain("codex");
    expect(output).toContain("copilot_chat_vscode");
    expect(output).toContain("github_copilot");
    expect(output).toContain("14 files");
  });

  it("reference validator passes with valid graph", () => {
    const output = runTsxScript("scripts/validate-instruction-references.ts");
    expect(output).toContain("Reference Graph Summary");
    expect(output).toContain("✅");
  });
});
