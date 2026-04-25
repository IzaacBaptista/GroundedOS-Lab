import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { loadLocalEnv } from "./load-env";

const touchedKeys = [
  "GROUND_TEST_ROOT",
  "GROUND_TEST_OVERRIDE",
  "GROUND_TEST_SHELL",
  "GROUND_TEST_APP",
];
const originalValues = new Map<string, string | undefined>();

afterEach(async () => {
  for (const key of touchedKeys) {
    const original = originalValues.get(key);

    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }

  originalValues.clear();
});

describe("loadLocalEnv", () => {
  it("loads root and app env files while preserving shell-provided values", async () => {
    const root = await mkdtemp(join(tmpdir(), "groundedos-env-test-"));

    try {
      rememberEnv();
      process.env.GROUND_TEST_SHELL = "from-shell";

      await writeFile(
        join(root, ".env"),
        [
          "GROUND_TEST_ROOT=from-root",
          "GROUND_TEST_OVERRIDE=from-root",
          "GROUND_TEST_SHELL=from-root",
        ].join("\n")
      );
      await writeFile(join(root, ".env.local"), "GROUND_TEST_OVERRIDE=from-root-local\n");
      await mkdir(join(root, "apps/api"), { recursive: true });
      await writeFile(
        join(root, "apps/api/.env"),
        [
          "GROUND_TEST_APP=from-app",
          "GROUND_TEST_OVERRIDE=from-app",
          "GROUND_TEST_SHELL=from-app",
        ].join("\n")
      );

      loadLocalEnv({ cwd: root, appDir: "apps/api" });

      expect(process.env.GROUND_TEST_ROOT).toBe("from-root");
      expect(process.env.GROUND_TEST_OVERRIDE).toBe("from-app");
      expect(process.env.GROUND_TEST_APP).toBe("from-app");
      expect(process.env.GROUND_TEST_SHELL).toBe("from-shell");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function rememberEnv(): void {
  for (const key of touchedKeys) {
    originalValues.set(key, process.env[key]);
  }
}
