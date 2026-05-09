import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import { parse, stringify } from "yaml";

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

async function writeYaml(path: string, data: unknown): Promise<void> {
  const next = stringify(data);
  await writeFile(resolve(REPO_ROOT, path), next.endsWith("\n") ? next : `${next}\n`, "utf8");
}

async function main(): Promise<void> {
  const [registryDocRaw, policyDocRaw] = await Promise.all([
    readYaml("instructions/schema/schema-registry.yaml"),
    readYaml("instructions/schema/migration-policy.yaml"),
  ]);

  assertCondition(isRecord(registryDocRaw), "Invalid schema registry format.");
  assertCondition(Array.isArray(registryDocRaw.schemas), "Schema registry must define schemas array.");

  assertCondition(isRecord(policyDocRaw), "Invalid migration policy format.");
  assertCondition(typeof policyDocRaw.current_version === "string", "Migration policy missing current_version.");
  assertCondition(Array.isArray(policyDocRaw.allowed_transitions), "Migration policy must define allowed_transitions.");
  assertCondition(Array.isArray(policyDocRaw.supported_versions), "Migration policy must define supported_versions.");

  const fromVersion = getArg("--from") ?? String(policyDocRaw.current_version);
  const toVersion = getArg("--to");
  assertCondition(typeof toVersion === "string" && toVersion.length > 0, "Missing required --to <version> argument.");

  const transitions: Transition[] = (policyDocRaw.allowed_transitions as unknown[]).map((item) => {
    assertCondition(isRecord(item), "Transition must be an object.");
    assertCondition(typeof item.from === "string", "Transition missing from.");
    assertCondition(typeof item.to === "string", "Transition missing to.");
    assertCondition(typeof item.mode === "string", "Transition missing mode.");
    return { from: item.from, to: item.to, mode: item.mode };
  });

  const transition = transitions.find((candidate) => candidate.from === fromVersion && candidate.to === toVersion);
  assertCondition(transition, `No allowed transition found for ${fromVersion} -> ${toVersion}.`);

  const registryEntries: RegistryEntry[] = (registryDocRaw.schemas as unknown[]).map((item) => {
    assertCondition(isRecord(item), "Schema entry must be an object.");
    assertCondition(typeof item.id === "string", "Schema entry missing id.");
    assertCondition(typeof item.file === "string", `Schema ${String(item.id)} missing file.`);
    assertCondition(typeof item.schema_version === "string", `Schema ${String(item.id)} missing schema_version.`);
    return {
      id: item.id,
      file: item.file,
      schema_version: item.schema_version,
    };
  });

  const impacted = registryEntries.filter((entry) => entry.schema_version === fromVersion);

  if (transition.mode === "noop") {
    console.log(
      JSON.stringify(
        {
          fromVersion,
          toVersion,
          transitionMode: transition.mode,
          impactedFileCount: impacted.length,
          changed: false,
          note: "No-op transition. No files modified.",
        },
        null,
        2
      )
    );
    return;
  }

  assertCondition(
    transition.mode === "apply",
    `Unsupported transition mode '${transition.mode}'. Expected 'apply' or 'noop'.`
  );

  for (const entry of impacted) {
    const fileDoc = await readYaml(entry.file);
    assertCondition(isRecord(fileDoc), `Schema target must be a YAML object: ${entry.file}`);
    fileDoc.schema_version = toVersion;
    await writeYaml(entry.file, fileDoc);
  }

  for (const schema of registryDocRaw.schemas as unknown[]) {
    if (!isRecord(schema)) {
      continue;
    }
    if (typeof schema.schema_version !== "string") {
      continue;
    }
    if (schema.schema_version === fromVersion) {
      schema.schema_version = toVersion;
    }
  }

  const supported = new Set<string>((policyDocRaw.supported_versions as unknown[]).map((item) => String(item)));
  supported.add(toVersion);
  policyDocRaw.supported_versions = Array.from(supported).sort((a, b) => a.localeCompare(b));
  policyDocRaw.current_version = toVersion;

  const hasSelfTransition = transitions.some((t) => t.from === toVersion && t.to === toVersion);
  if (!hasSelfTransition) {
    (policyDocRaw.allowed_transitions as unknown[]).push({ from: toVersion, to: toVersion, mode: "noop" });
  }

  await Promise.all([
    writeYaml("instructions/schema/schema-registry.yaml", registryDocRaw),
    writeYaml("instructions/schema/migration-policy.yaml", policyDocRaw),
  ]);

  console.log(
    JSON.stringify(
      {
        fromVersion,
        toVersion,
        transitionMode: transition.mode,
        impactedFileCount: impacted.length,
        changed: true,
        impactedFiles: impacted.map((entry) => ({ id: entry.id, file: entry.file })),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("Schema migration apply failed:", error);
  process.exit(1);
});
