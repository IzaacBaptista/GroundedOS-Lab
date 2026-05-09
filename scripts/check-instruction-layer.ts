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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
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

  validateManifest(manifestDoc);
  validateIndex(indexDoc);
  validateAdapters(adaptersDoc);
  await validateEntrypointPaths(indexDoc);
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
