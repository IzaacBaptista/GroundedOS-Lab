import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

type LoadEnvOptions = {
  appDir?: string;
  cwd?: string;
};

/**
 * Minimal local `.env` loader for Node-side commands. Shell-provided variables
 * keep priority; files only fill missing keys.
 */
export function loadLocalEnv(options: LoadEnvOptions = {}): void {
  const root = options.cwd ?? process.cwd();
  const protectedKeys = new Set(Object.keys(process.env));
  const files = [
    resolve(root, ".env"),
    resolve(root, ".env.local"),
    ...(options.appDir
      ? [resolve(root, options.appDir, ".env"), resolve(root, options.appDir, ".env.local")]
      : []),
  ];

  for (const file of files) {
    loadEnvFile(file, protectedKeys);
  }
}

function loadEnvFile(path: string, protectedKeys: Set<string>): void {
  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, "utf-8").split(/\r?\n/);

  for (const line of lines) {
    const parsed = parseEnvLine(line);

    if (!parsed || protectedKeys.has(parsed.key)) {
      continue;
    }

    process.env[parsed.key] = parsed.value;
  }
}

function parseEnvLine(line: string): { key: string; value: string } | undefined {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return undefined;
  }

  const separator = trimmed.indexOf("=");

  if (separator <= 0) {
    return undefined;
  }

  const key = trimmed.slice(0, separator).trim();
  const rawValue = trimmed.slice(separator + 1).trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return undefined;
  }

  return {
    key,
    value: unquote(rawValue),
  };
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  const commentStart = value.indexOf(" #");

  return commentStart >= 0 ? value.slice(0, commentStart).trim() : value;
}
