import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

function runTsxScript(scriptPath: string, args: string[] = []): string {
  return execFileSync(
    process.execPath,
    ["--import", "tsx", scriptPath, ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
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
});
