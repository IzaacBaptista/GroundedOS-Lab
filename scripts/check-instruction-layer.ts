import { access, readFile } from "fs/promises";
import { constants } from "fs";
import { resolve } from "path";
import { parse } from "yaml";
import { resolveInstructionLayer } from "./resolve-instruction-layer";

type JsonRecord = Record<string, unknown>;

const REPO_ROOT = process.cwd();

const requiredPaths = [
  "instructions/manifest.yaml",
  "instructions/index.yaml",
  "instructions/schema/schema-registry.yaml",
  "instructions/schema/migration-policy.yaml",
  "configs/default-profile.yaml",
  "configs/adapters.yaml",
  "agents/planner.yaml",
  "agents/implementer.yaml",
  "agents/reviewer.yaml",
  "skills/registry.yaml",
  "context/project-context.yaml",
  "context/contribution-context.yaml",
  "prompts/feature-request.md",
  "prompts/bugfix-request.md",
  "prompts/review-request.md",
  "prompts/docs-request.md",
  "evals/adherence-rubric.yaml",
  "evals/review-rubric.yaml",
] as const;

type SchemaRegistryEntry = {
  id: string;
  file: string;
  schema_version: string;
  deprecated?: boolean;
  deprecated_since?: string;
  replacement_id?: string;
};

type SchemaDocMap = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function parseSchemaVersion(version: string): [number, number] {
  const [majorRaw, minorRaw = "0"] = version.split(".");
  const major = Number.parseInt(majorRaw, 10);
  const minor = Number.parseInt(minorRaw, 10);
  assertCondition(Number.isFinite(major), `invalid schema major version: ${version}`);
  assertCondition(Number.isFinite(minor), `invalid schema minor version: ${version}`);
  return [major, minor];
}

function isSchemaAtLeast(version: string, targetMajor: number, targetMinor: number): boolean {
  const [major, minor] = parseSchemaVersion(version);
  if (major > targetMajor) {
    return true;
  }
  if (major < targetMajor) {
    return false;
  }
  return minor >= targetMinor;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(resolve(REPO_ROOT, path), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function readYaml(path: string): Promise<unknown> {
  const content = await readFile(resolve(REPO_ROOT, path), "utf8");
  return parse(content);
}

function validateManifest(manifest: unknown): void {
  assertCondition(isRecord(manifest), "instructions/manifest.yaml must be a YAML object.");

  const requiredStringFields = ["version", "name", "owner", "status", "strictness"] as const;
  for (const field of requiredStringFields) {
    assertCondition(typeof manifest[field] === "string", `manifest missing string field: ${field}`);
  }

  const consumers = manifest.consumers;
  assertCondition(Array.isArray(consumers), "manifest.consumers must be an array.");
  assertCondition(consumers.length > 0, "manifest.consumers must not be empty.");

  const resolutionOrder = manifest.resolution_order;
  assertCondition(Array.isArray(resolutionOrder), "manifest.resolution_order must be an array.");
  assertCondition(resolutionOrder.includes("user-request"), "manifest.resolution_order must include user-request.");
}

function validateSchemaRegistry(registryDoc: unknown): SchemaRegistryEntry[] {
  assertCondition(isRecord(registryDoc), "instructions/schema/schema-registry.yaml must be a YAML object.");
  assertCondition(typeof registryDoc.version === "number", "schema registry must define numeric version.");
  assertCondition(Array.isArray(registryDoc.schemas), "schema registry must define schemas array.");

  const entries: SchemaRegistryEntry[] = [];
  const seenIds = new Set<string>();
  const seenFiles = new Set<string>();

  for (const schema of registryDoc.schemas as unknown[]) {
    assertCondition(isRecord(schema), "schema entry must be an object.");
    assertCondition(typeof schema.id === "string", "schema entry missing id.");
    assertCondition(typeof schema.file === "string", `schema ${String(schema.id)} missing file.`);
    assertCondition(typeof schema.schema_version === "string", `schema ${String(schema.id)} missing schema_version.`);

    if (schema.deprecated !== undefined) {
      assertCondition(typeof schema.deprecated === "boolean", `schema ${schema.id} deprecated must be boolean when provided.`);
      if (schema.deprecated) {
        assertCondition(
          typeof schema.deprecated_since === "string",
          `schema ${schema.id} deprecated_since must be string when deprecated is true.`
        );
        assertCondition(
          typeof schema.replacement_id === "string",
          `schema ${schema.id} replacement_id must be string when deprecated is true.`
        );
      }
    }

    assertCondition(!seenIds.has(schema.id), `duplicate schema id in registry: ${schema.id}`);
    assertCondition(!seenFiles.has(schema.file), `duplicate schema file in registry: ${schema.file}`);

    seenIds.add(schema.id);
    seenFiles.add(schema.file);

    entries.push({
      id: schema.id,
      file: schema.file,
      schema_version: schema.schema_version,
      deprecated: typeof schema.deprecated === "boolean" ? schema.deprecated : undefined,
      deprecated_since: typeof schema.deprecated_since === "string" ? schema.deprecated_since : undefined,
      replacement_id: typeof schema.replacement_id === "string" ? schema.replacement_id : undefined,
    });
  }

  assertCondition(entries.length > 0, "schema registry must contain at least one schema entry.");
  return entries;
}

async function validateSchemaVersions(entries: SchemaRegistryEntry[]): Promise<void> {
  for (const entry of entries) {
    const exists = await pathExists(entry.file);
    assertCondition(exists, `schema target file not found: ${entry.file}`);

    const fileDoc = await readYaml(entry.file);
    assertCondition(isRecord(fileDoc), `schema target must be YAML object: ${entry.file}`);
    assertCondition(typeof fileDoc.schema_version === "string", `schema target missing schema_version: ${entry.file}`);
    assertCondition(
      fileDoc.schema_version === entry.schema_version,
      `schema version mismatch for ${entry.file}: expected ${entry.schema_version}, got ${String(fileDoc.schema_version)}`
    );
  }
}

function validateSchemaContentMinimum(entry: SchemaRegistryEntry, doc: unknown): void {
  assertCondition(isRecord(doc), `schema target must be YAML object: ${entry.file}`);

  switch (entry.id) {
    case "instruction-manifest": {
      const required = ["version", "name", "owner", "status", "strictness"] as const;
      for (const key of required) {
        assertCondition(typeof doc[key] === "string", `${entry.file} missing required field '${key}'.`);
      }
      assertCondition(Array.isArray(doc.consumers) && doc.consumers.length > 0, `${entry.file} requires non-empty consumers.`);
      assertCondition(
        Array.isArray(doc.resolution_order) && doc.resolution_order.includes("user-request"),
        `${entry.file} requires resolution_order including 'user-request'.`
      );
      assertCondition(isRecord(doc.governance), `${entry.file} requires governance object.`);
      assertCondition(typeof doc.governance.docs_policy === "string", `${entry.file} governance.docs_policy must be string.`);
      assertCondition(typeof doc.governance.pr_template === "string", `${entry.file} governance.pr_template must be string.`);
      break;
    }

    case "instruction-index": {
      assertCondition(isRecord(doc.entrypoints), `${entry.file} requires entrypoints object.`);
      const requiredEntrypoints = [
        "manifest",
        "config_profile",
        "adapters",
        "project_context",
        "contribution_context",
        "skills_registry",
        "eval_adherence",
        "eval_review",
      ] as const;
      for (const key of requiredEntrypoints) {
        assertCondition(typeof doc.entrypoints[key] === "string", `${entry.file} missing entrypoint '${key}'.`);
      }
      break;
    }

    case "config-default-profile": {
      assertCondition(typeof doc.profile === "string", `${entry.file} requires profile string.`);
      assertCondition(typeof doc.strictness === "string", `${entry.file} requires strictness string.`);
      assertCondition(isRecord(doc.output), `${entry.file} requires output object.`);
      assertCondition(isRecord(doc.workflow), `${entry.file} requires workflow object.`);
      assertCondition(isRecord(doc.policies), `${entry.file} requires policies object.`);
      break;
    }

    case "config-adapters": {
      assertCondition(isRecord(doc.adapters), `${entry.file} requires adapters object.`);
      const adapters = Object.entries(doc.adapters);
      assertCondition(adapters.length > 0, `${entry.file} requires at least one adapter.`);
      for (const [adapterName, adapterDef] of adapters) {
        assertCondition(isRecord(adapterDef), `${entry.file} adapter '${adapterName}' must be an object.`);
        assertCondition(
          Array.isArray(adapterDef.source_of_truth) && adapterDef.source_of_truth.length > 0,
          `${entry.file} adapter '${adapterName}' requires non-empty source_of_truth.`
        );

        for (const source of adapterDef.source_of_truth as unknown[]) {
          assertCondition(typeof source === "string", `${entry.file} adapter '${adapterName}' source_of_truth items must be strings.`);
        }

        if (isSchemaAtLeast(entry.schema_version, 1, 3)) {
          assertCondition(
            typeof adapterDef.output_format === "string",
            `${entry.file} adapter '${adapterName}' output_format must be string for schema >= 1.3.`
          );
          assertCondition(
            adapterDef.output_format === "bundle-json+markdown",
            `${entry.file} adapter '${adapterName}' output_format must be 'bundle-json+markdown'.`
          );

          assertCondition(
            typeof adapterDef.merge_strategy === "string",
            `${entry.file} adapter '${adapterName}' merge_strategy must be string for schema >= 1.3.`
          );
          assertCondition(
            adapterDef.merge_strategy === "ordered-first-wins",
            `${entry.file} adapter '${adapterName}' merge_strategy must be 'ordered-first-wins'.`
          );

          assertCondition(
            isRecord(adapterDef.context_window_policy),
            `${entry.file} adapter '${adapterName}' context_window_policy must be object for schema >= 1.3.`
          );
          assertCondition(
            typeof adapterDef.context_window_policy.max_files === "number" && adapterDef.context_window_policy.max_files > 0,
            `${entry.file} adapter '${adapterName}' context_window_policy.max_files must be positive number.`
          );
          assertCondition(
            typeof adapterDef.context_window_policy.include_user_request === "boolean",
            `${entry.file} adapter '${adapterName}' context_window_policy.include_user_request must be boolean.`
          );
        }
      }
      break;
    }

    case "context-project": {
      assertCondition(isRecord(doc.project), `${entry.file} requires project object.`);
      assertCondition(typeof doc.project.name === "string", `${entry.file} project.name must be string.`);
      assertCondition(typeof doc.project.mission_en === "string", `${entry.file} project.mission_en must be string.`);
      assertCondition(typeof doc.project.mission_ptbr === "string", `${entry.file} project.mission_ptbr must be string.`);
      assertCondition(isRecord(doc.roadmap) && isRecord(doc.roadmap.phase_status), `${entry.file} requires roadmap.phase_status object.`);
      break;
    }

    case "context-contribution": {
      assertCondition(isRecord(doc.contribution), `${entry.file} requires contribution object.`);
      assertCondition(Array.isArray(doc.contribution.pr_requirements), `${entry.file} contribution.pr_requirements must be array.`);
      assertCondition(Array.isArray(doc.contribution.mandatory_docs_sync), `${entry.file} contribution.mandatory_docs_sync must be array.`);
      break;
    }

    case "agent-planner":
    case "agent-implementer":
    case "agent-reviewer": {
      assertCondition(typeof doc.id === "string", `${entry.file} requires id string.`);
      assertCondition(typeof doc.name === "string", `${entry.file} requires name string.`);
      assertCondition(typeof doc.purpose_en === "string", `${entry.file} requires purpose_en string.`);
      assertCondition(typeof doc.purpose_ptbr === "string", `${entry.file} requires purpose_ptbr string.`);
      assertCondition(Array.isArray(doc.default_behavior) && doc.default_behavior.length > 0, `${entry.file} requires non-empty default_behavior.`);
      break;
    }

    case "skills-registry": {
      assertCondition(typeof doc.version === "number", `${entry.file} requires numeric version.`);
      assertCondition(Array.isArray(doc.skills) && doc.skills.length > 0, `${entry.file} requires non-empty skills array.`);
      for (const skill of doc.skills as unknown[]) {
        assertCondition(isRecord(skill), `${entry.file} skill entry must be an object.`);
        assertCondition(typeof skill.id === "string", `${entry.file} skill.id must be string.`);
        assertCondition(Array.isArray(skill.intent_patterns) && skill.intent_patterns.length > 0, `${entry.file} skill.intent_patterns must be non-empty array.`);
        assertCondition(typeof skill.agent === "string", `${entry.file} skill.agent must be string.`);
        assertCondition(typeof skill.prompt_template === "string", `${entry.file} skill.prompt_template must be string.`);
        assertCondition(typeof skill.eval_profile === "string", `${entry.file} skill.eval_profile must be string.`);

        if (isSchemaAtLeast(entry.schema_version, 1, 2)) {
          assertCondition(typeof skill.owner === "string", `${entry.file} skill.owner must be string for schema >= 1.2.`);
          assertCondition(typeof skill.stability === "string", `${entry.file} skill.stability must be string for schema >= 1.2.`);
          assertCondition(
            Array.isArray(skill.examples) && skill.examples.length > 0,
            `${entry.file} skill.examples must be non-empty array for schema >= 1.2.`
          );
        }
      }
      break;
    }

    case "eval-adherence-rubric":
    case "eval-review-rubric": {
      assertCondition(typeof doc.name === "string", `${entry.file} requires name string.`);
      assertCondition(typeof doc.mode === "string", `${entry.file} requires mode string.`);
      assertCondition(Array.isArray(doc.checks) && doc.checks.length > 0, `${entry.file} requires non-empty checks array.`);
      assertCondition(isRecord(doc.scoring), `${entry.file} requires scoring object.`);
      assertCondition(typeof doc.scoring.pass_threshold === "number", `${entry.file} scoring.pass_threshold must be number.`);
      break;
    }

    default:
      break;
  }
}

async function validateSchemaContent(entries: SchemaRegistryEntry[]): Promise<void> {
  const docs: SchemaDocMap = {};
  for (const entry of entries) {
    docs[entry.file] = await readYaml(entry.file);
  }

  for (const entry of entries) {
    validateSchemaContentMinimum(entry, docs[entry.file]);
  }
}

function validateMigrationPolicy(policyDoc: unknown, entries: SchemaRegistryEntry[]): void {
  assertCondition(isRecord(policyDoc), "instructions/schema/migration-policy.yaml must be a YAML object.");
  assertCondition(typeof policyDoc.current_version === "string", "migration policy missing current_version.");
  assertCondition(Array.isArray(policyDoc.supported_versions), "migration policy must define supported_versions array.");
  assertCondition(Array.isArray(policyDoc.allowed_transitions), "migration policy must define allowed_transitions array.");

  const supportedVersions = new Set<string>();
  for (const item of policyDoc.supported_versions as unknown[]) {
    assertCondition(typeof item === "string", "supported_versions items must be strings.");
    supportedVersions.add(item);
  }

  const currentVersion = policyDoc.current_version;
  assertCondition(supportedVersions.has(currentVersion), "current_version must be listed in supported_versions.");

  for (const transition of policyDoc.allowed_transitions as unknown[]) {
    assertCondition(isRecord(transition), "allowed transition must be an object.");
    assertCondition(typeof transition.from === "string", "transition missing from.");
    assertCondition(typeof transition.to === "string", "transition missing to.");
    assertCondition(typeof transition.mode === "string", "transition missing mode.");
  }

  for (const entry of entries) {
    assertCondition(
      supportedVersions.has(entry.schema_version),
      `schema version ${entry.schema_version} from ${entry.file} is not listed in supported_versions.`
    );
  }
}

function validateIndex(indexDoc: unknown): void {
  assertCondition(isRecord(indexDoc), "instructions/index.yaml must be a YAML object.");
  assertCondition(isRecord(indexDoc.entrypoints), "instructions/index.yaml requires entrypoints map.");

  const entrypoints = indexDoc.entrypoints as JsonRecord;
  const requiredEntrypoints = [
    "manifest",
    "config_profile",
    "adapters",
    "project_context",
    "contribution_context",
    "skills_registry",
    "eval_adherence",
    "eval_review",
  ] as const;

  for (const key of requiredEntrypoints) {
    assertCondition(typeof entrypoints[key] === "string", `instructions/index.yaml missing entrypoint: ${key}`);
  }
}

function validateAdapters(adaptersDoc: unknown): string[] {
  assertCondition(isRecord(adaptersDoc), "configs/adapters.yaml must be a YAML object.");
  assertCondition(isRecord(adaptersDoc.adapters), "configs/adapters.yaml requires adapters map.");

  const adapters = adaptersDoc.adapters as JsonRecord;
  const adapterNames = Object.keys(adapters);
  assertCondition(adapterNames.length > 0, "configs/adapters.yaml must define at least one adapter.");

  for (const adapterName of adapterNames) {
    const adapterValue = adapters[adapterName];
    assertCondition(isRecord(adapterValue), `adapter ${adapterName} must be an object.`);
    const source = adapterValue.source_of_truth;
    assertCondition(Array.isArray(source), `adapter ${adapterName} must define source_of_truth array.`);
    assertCondition(source.length > 0, `adapter ${adapterName} source_of_truth must not be empty.`);
  }

  return adapterNames;
}

async function validateSkillsAndReferences(): Promise<void> {
  const registryDoc = await readYaml("skills/registry.yaml");
  assertCondition(isRecord(registryDoc), "skills/registry.yaml must be a YAML object.");
  assertCondition(Array.isArray(registryDoc.skills), "skills/registry.yaml must define skills array.");

  const skills = registryDoc.skills as unknown[];
  assertCondition(skills.length > 0, "skills/registry.yaml skills must not be empty.");

  const agentFiles = await Promise.all([
    readYaml("agents/planner.yaml"),
    readYaml("agents/implementer.yaml"),
    readYaml("agents/reviewer.yaml"),
  ]);

  const knownAgents = new Set<string>();
  for (const doc of agentFiles) {
    assertCondition(isRecord(doc), "agent file must be a YAML object.");
    assertCondition(typeof doc.id === "string", "agent file missing id.");
    knownAgents.add(doc.id);
  }

  for (const skill of skills) {
    assertCondition(isRecord(skill), "each skill must be an object.");
    assertCondition(typeof skill.id === "string", "skill.id must be string.");
    assertCondition(typeof skill.agent === "string", `skill ${String(skill.id)} missing agent.`);
    assertCondition(typeof skill.prompt_template === "string", `skill ${String(skill.id)} missing prompt_template.`);
    assertCondition(typeof skill.eval_profile === "string", `skill ${String(skill.id)} missing eval_profile.`);

    assertCondition(knownAgents.has(skill.agent), `skill ${String(skill.id)} references unknown agent: ${skill.agent}`);

    const promptExists = await pathExists(skill.prompt_template);
    assertCondition(promptExists, `skill ${String(skill.id)} prompt template not found: ${skill.prompt_template}`);

    const evalExists = await pathExists(skill.eval_profile);
    assertCondition(evalExists, `skill ${String(skill.id)} eval profile not found: ${skill.eval_profile}`);
  }
}

async function validateEntrypointPaths(indexDoc: unknown): Promise<void> {
  assertCondition(isRecord(indexDoc) && isRecord(indexDoc.entrypoints), "invalid index entrypoints format.");

  const entrypoints = indexDoc.entrypoints as JsonRecord;
  for (const value of Object.values(entrypoints)) {
    if (typeof value !== "string") {
      continue;
    }
    const exists = await pathExists(value);
    assertCondition(exists, `entrypoint path not found: ${value}`);
  }
}

async function validateCodeownersCoverage(): Promise<void> {
  const codeownersPath = ".github/CODEOWNERS";
  const exists = await pathExists(codeownersPath);
  assertCondition(exists, "Missing .github/CODEOWNERS file.");

  const content = await readFile(resolve(REPO_ROOT, codeownersPath), "utf8");
  const requiredPatterns = [
    "/instructions/",
    "/agents/",
    "/skills/",
    "/context/",
    "/prompts/",
    "/evals/",
    "/configs/",
    "/scripts/check-instruction-layer.ts",
    "/scripts/resolve-instruction-layer.ts",
  ] as const;

  for (const pattern of requiredPatterns) {
    assertCondition(
      content.includes(pattern),
      `CODEOWNERS missing required instruction-layer ownership pattern: ${pattern}`
    );
  }
}

async function main(): Promise<void> {
  for (const path of requiredPaths) {
    const exists = await pathExists(path);
    assertCondition(exists, `required path missing: ${path}`);
  }

  const [manifestDoc, indexDoc, adaptersDoc] = await Promise.all([
    readYaml("instructions/manifest.yaml"),
    readYaml("instructions/index.yaml"),
    readYaml("configs/adapters.yaml"),
  ]);

  const migrationPolicyDoc = await readYaml("instructions/schema/migration-policy.yaml");

  const schemaRegistryDoc = await readYaml("instructions/schema/schema-registry.yaml");
  const schemaEntries = validateSchemaRegistry(schemaRegistryDoc);
  await validateSchemaVersions(schemaEntries);
  await validateSchemaContent(schemaEntries);
  validateMigrationPolicy(migrationPolicyDoc, schemaEntries);

  validateManifest(manifestDoc);
  validateIndex(indexDoc);
  validateAdapters(adaptersDoc);
  await validateEntrypointPaths(indexDoc);
  await validateCodeownersCoverage();
  await validateSkillsAndReferences();

  const report = await resolveInstructionLayer();
  assertCondition(report.consumers.length > 0, "resolver produced no consumer bundles.");
  for (const consumer of report.consumers) {
    assertCondition(consumer.fileCount > 0, `consumer ${consumer.consumer} bundle is empty.`);
  }

  console.log("Instruction layer check passed.");
}

main().catch((error) => {
  console.error("Instruction layer check failed:", error);
  process.exit(1);
});
