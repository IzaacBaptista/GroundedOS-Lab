import { readFile } from "fs/promises";
import { resolve } from "path";
import { parse } from "yaml";

type JsonRecord = Record<string, unknown>;
type SchemaEntry = {
  id: string;
  file: string;
  schema_version: string;
  deprecated?: boolean;
  deprecated_since?: string;
  replacement_id?: string;
};

type DeprecationReport = {
  generatedAt: string;
  totalEntries: number;
  deprecatedCount: number;
  entries: Array<{
    id: string;
    file: string;
    deprecated_since: string;
    replacement_id: string;
    migration_notes: string;
  }>;
};

const REPO_ROOT = process.cwd();

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function readYaml(path: string): Promise<unknown> {
  const content = await readFile(resolve(REPO_ROOT, path), "utf8");
  return parse(content);
}

async function main(): Promise<void> {
  const registryDoc = await readYaml("instructions/schema/schema-registry.yaml");
  assertCondition(isRecord(registryDoc), "Invalid schema registry format.");
  assertCondition(Array.isArray(registryDoc.schemas), "Schema registry must define schemas array.");

  const entries: SchemaEntry[] = (registryDoc.schemas as unknown[]).map((item) => {
    assertCondition(isRecord(item), "Schema entry must be an object.");
    assertCondition(typeof item.id === "string", "Schema entry missing id.");
    assertCondition(typeof item.file === "string", `Schema ${String(item.id)} missing file.`);
    assertCondition(typeof item.schema_version === "string", `Schema ${String(item.id)} missing schema_version.`);

    return {
      id: item.id,
      file: item.file,
      schema_version: item.schema_version,
      deprecated: typeof item.deprecated === "boolean" ? item.deprecated : undefined,
      deprecated_since: typeof item.deprecated_since === "string" ? item.deprecated_since : undefined,
      replacement_id: typeof item.replacement_id === "string" ? item.replacement_id : undefined,
    };
  });

  const deprecated = entries.filter(
    (entry) => entry.deprecated === true && entry.deprecated_since && entry.replacement_id
  );

  const report: DeprecationReport = {
    generatedAt: new Date().toISOString(),
    totalEntries: entries.length,
    deprecatedCount: deprecated.length,
    entries: deprecated.map((entry) => ({
      id: entry.id,
      file: entry.file,
      deprecated_since: entry.deprecated_since!,
      replacement_id: entry.replacement_id!,
      migration_notes: `Replace references to '${entry.id}' with '${entry.replacement_id}' (deprecated since ${entry.deprecated_since}).`,
    })),
  };

  if (deprecated.length === 0) {
    console.log("No deprecated instruction-layer entries found.");
    return;
  }

  console.log("\n=== Instruction Layer Deprecation Report ===\n");
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Total entries: ${report.totalEntries}`);
  console.log(`Deprecated: ${report.deprecatedCount}\n`);

  for (const entry of report.entries) {
    console.log(`📦 ${entry.id}`);
    console.log(`   File: ${entry.file}`);
    console.log(`   Deprecated since: ${entry.deprecated_since}`);
    console.log(`   Replacement: ${entry.replacement_id}`);
    console.log(`   Notes: ${entry.migration_notes}`);
    console.log();
  }

  console.log("=== Migration Checklist ===\n");
  for (const entry of report.entries) {
    console.log(`- [ ] Update references from '${entry.id}' to '${entry.replacement_id}'`);
  }

  process.exit(deprecated.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Deprecation report failed:", error);
  process.exit(1);
});
