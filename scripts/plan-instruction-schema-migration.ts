import { readFile } from "fs/promises";
import { resolve } from "path";
import { parse } from "yaml";

type JsonRecord = Record<string, unknown>;

type RegistryEntry = {
  id: string;
  file: string;
  schema_version: string;
};

type Transition = {
  from: string;
  to: string;
  mode: string;
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

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readYaml(path: string): Promise<unknown> {
  const content = await readFile(resolve(REPO_ROOT, path), "utf8");
  return parse(content);
}

async function main(): Promise<void> {
  const [registryDoc, policyDoc] = await Promise.all([
    readYaml("instructions/schema/schema-registry.yaml"),
    readYaml("instructions/schema/migration-policy.yaml"),
  ]);

  assertCondition(isRecord(registryDoc), "Invalid schema registry format.");
  assertCondition(Array.isArray(registryDoc.schemas), "Schema registry must define schemas array.");

  assertCondition(isRecord(policyDoc), "Invalid migration policy format.");
  assertCondition(typeof policyDoc.current_version === "string", "Migration policy missing current_version.");
  assertCondition(Array.isArray(policyDoc.allowed_transitions), "Migration policy must define allowed_transitions.");

  const currentVersion = String(policyDoc.current_version);
  const fromVersion = getArg("--from") ?? currentVersion;
  const toVersion = getArg("--to") ?? currentVersion;

  const entries: RegistryEntry[] = (registryDoc.schemas as unknown[]).map((entry) => {
    assertCondition(isRecord(entry), "Schema entry must be an object.");
    assertCondition(typeof entry.id === "string", "Schema entry missing id.");
    assertCondition(typeof entry.file === "string", `Schema ${String(entry.id)} missing file.`);
    assertCondition(typeof entry.schema_version === "string", `Schema ${String(entry.id)} missing schema_version.`);

    return {
      id: entry.id,
      file: entry.file,
      schema_version: entry.schema_version,
    };
  });

  const transitions: Transition[] = (policyDoc.allowed_transitions as unknown[]).map((entry) => {
    assertCondition(isRecord(entry), "Transition must be an object.");
    assertCondition(typeof entry.from === "string", "Transition missing from.");
    assertCondition(typeof entry.to === "string", "Transition missing to.");
    assertCondition(typeof entry.mode === "string", "Transition missing mode.");

    return {
      from: entry.from,
      to: entry.to,
      mode: entry.mode,
    };
  });

  const transition = transitions.find((candidate) => candidate.from === fromVersion && candidate.to === toVersion);
  assertCondition(transition, `No allowed transition found for ${fromVersion} -> ${toVersion}.`);

  const impacted = entries.filter((entry) => entry.schema_version === fromVersion);

  const plan = {
    fromVersion,
    toVersion,
    transitionMode: transition.mode,
    impactedFileCount: impacted.length,
    impactedFiles: impacted.map((entry) => ({ id: entry.id, file: entry.file })),
    notes: {
      en: "Planning-only output. No files were modified.",
      "pt-BR": "Saida apenas de planejamento. Nenhum arquivo foi modificado.",
    },
  };

  console.log(JSON.stringify(plan, null, 2));
}

main().catch((error) => {
  console.error("Schema migration plan failed:", error);
  process.exit(1);
});
