import { access } from "fs/promises";
import { constants } from "fs";

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
];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const missing: string[] = [];

  for (const path of requiredPaths) {
    if (!(await exists(path))) {
      missing.push(path);
    }
  }

  if (missing.length > 0) {
    console.error("Instruction layer validation failed. Missing required paths:");
    for (const path of missing) {
      console.error(`- ${path}`);
    }
    process.exit(1);
  }

  console.log("Instruction layer validation passed.");
}

main().catch((error) => {
  console.error("Instruction layer validation crashed:", error);
  process.exit(1);
});
