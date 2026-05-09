import { access, readFile } from "fs/promises";
import { constants } from "fs";
import { resolve } from "path";
import { parse } from "yaml";

type JsonRecord = Record<string, unknown>;

type ReferenceGraph = {
  skills: Map<string, { agent: string; prompt: string; eval: string }>;
  agents: Set<string>;
  prompts: Set<string>;
  evals: Set<string>;
};

type ValidationReport = {
  valid: boolean;
  totalReferences: number;
  brokenReferences: string[];
  inconsistencies: string[];
  summary: string;
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

async function fileExists(path: string): Promise<boolean> {
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

async function buildReferenceGraph(): Promise<ReferenceGraph> {
  const graph: ReferenceGraph = {
    skills: new Map(),
    agents: new Set(),
    prompts: new Set(),
    evals: new Set(),
  };

  // Load agents
  const agentFiles = ["agents/planner.yaml", "agents/implementer.yaml", "agents/reviewer.yaml"];
  for (const file of agentFiles) {
    const doc = await readYaml(file);
    assertCondition(isRecord(doc), `${file} must be YAML object`);
    assertCondition(typeof doc.id === "string", `${file} missing id`);
    graph.agents.add(doc.id);
  }

  // Load prompts
  const promptDir = "prompts";
  const promptFiles = ["feature-request.md", "bugfix-request.md", "review-request.md", "docs-request.md"];
  for (const file of promptFiles) {
    const path = `${promptDir}/${file}`;
    const exists = await fileExists(path);
    if (exists) {
      graph.prompts.add(path);
    }
  }

  // Load evals
  const evalFiles = ["evals/adherence-rubric.yaml", "evals/review-rubric.yaml"];
  for (const file of evalFiles) {
    const doc = await readYaml(file);
    assertCondition(isRecord(doc), `${file} must be YAML object`);
    assertCondition(typeof doc.name === "string", `${file} missing name`);
    graph.evals.add(file);
  }

  // Load skills and their references
  const skillsDoc = await readYaml("skills/registry.yaml");
  assertCondition(isRecord(skillsDoc), "skills/registry.yaml must be YAML object");
  assertCondition(Array.isArray(skillsDoc.skills), "skills must be array");

  for (const skill of skillsDoc.skills as unknown[]) {
    assertCondition(isRecord(skill), "skill must be object");
    assertCondition(typeof skill.id === "string", "skill missing id");
    assertCondition(typeof skill.agent === "string", `skill ${skill.id} missing agent`);
    assertCondition(typeof skill.prompt_template === "string", `skill ${skill.id} missing prompt_template`);
    assertCondition(typeof skill.eval_profile === "string", `skill ${skill.id} missing eval_profile`);

    graph.skills.set(skill.id, {
      agent: skill.agent,
      prompt: skill.prompt_template,
      eval: skill.eval_profile,
    });
  }

  return graph;
}

async function validateReferences(graph: ReferenceGraph): Promise<ValidationReport> {
  const brokenReferences: string[] = [];
  const inconsistencies: string[] = [];
  let totalReferences = 0;

  // Check all skill references
  for (const [skillId, refs] of graph.skills) {
    totalReferences += 3; // agent, prompt, eval

    // Validate agent reference
    if (!graph.agents.has(refs.agent)) {
      brokenReferences.push(`skill '${skillId}' references unknown agent: ${refs.agent}`);
    }

    // Validate prompt reference
    const promptExists = await fileExists(refs.prompt);
    if (!promptExists) {
      brokenReferences.push(`skill '${skillId}' references missing prompt: ${refs.prompt}`);
    }

    // Validate eval reference
    if (!graph.evals.has(refs.eval)) {
      brokenReferences.push(`skill '${skillId}' references unknown eval: ${refs.eval}`);
    }
  }

  // Check for orphaned agents (agents not referenced by any skill)
  for (const agent of graph.agents) {
    let referenced = false;
    for (const refs of graph.skills.values()) {
      if (refs.agent === agent) {
        referenced = true;
        break;
      }
    }
    if (!referenced) {
      inconsistencies.push(`agent '${agent}' is not referenced by any skill`);
    }
  }

  // Check for orphaned evals
  for (const evalFile of graph.evals) {
    let referenced = false;
    for (const refs of graph.skills.values()) {
      if (refs.eval === evalFile) {
        referenced = true;
        break;
      }
    }
    if (!referenced) {
      inconsistencies.push(`eval '${evalFile}' is not referenced by any skill`);
    }
  }

  // Check for orphaned prompts
  for (const prompt of graph.prompts) {
    let referenced = false;
    for (const refs of graph.skills.values()) {
      if (refs.prompt === prompt) {
        referenced = true;
        break;
      }
    }
    if (!referenced) {
      inconsistencies.push(`prompt '${prompt}' is not referenced by any skill`);
    }
  }

  const valid = brokenReferences.length === 0;
  const summary = valid
    ? `✅ All ${totalReferences} references are valid. ${inconsistencies.length} orphaned components.`
    : `❌ ${brokenReferences.length} broken references found. ${inconsistencies.length} inconsistencies.`;

  return {
    valid,
    totalReferences,
    brokenReferences,
    inconsistencies,
    summary,
  };
}

async function main(): Promise<void> {
  console.log("=== Instruction Layer Reference Validator ===\n");

  const graph = await buildReferenceGraph();

  console.log("Reference Graph Summary:");
  console.log(`- Agents: ${graph.agents.size}`);
  console.log(`- Skills: ${graph.skills.size}`);
  console.log(`- Prompts: ${graph.prompts.size}`);
  console.log(`- Evals: ${graph.evals.size}\n`);

  const report = await validateReferences(graph);

  console.log(report.summary);

  if (report.brokenReferences.length > 0) {
    console.log("\n❌ Broken References:");
    for (const ref of report.brokenReferences) {
      console.log(`  - ${ref}`);
    }
  }

  if (report.inconsistencies.length > 0) {
    console.log("\n⚠️  Inconsistencies (Non-blocking):");
    for (const inc of report.inconsistencies) {
      console.log(`  - ${inc}`);
    }
  }

  if (report.valid) {
    console.log("\n✅ All references validated successfully.");
    process.exit(0);
  } else {
    console.log("\n❌ Validation failed due to broken references.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Reference validation crashed:", error);
  process.exit(1);
});
