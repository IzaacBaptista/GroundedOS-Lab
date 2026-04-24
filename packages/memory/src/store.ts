import { randomUUID } from "crypto";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import type { MemoryEntry, MemorySearchResult, SessionMemoryStore } from "./types";

const DEFAULT_MEMORY_DIR = ".groundedos/memory/sessions";

export class FileSessionMemoryStore implements SessionMemoryStore {
  private readonly baseDir: string;

  constructor(baseDir = DEFAULT_MEMORY_DIR) {
    this.baseDir = baseDir;
  }

  async append(entry: Omit<MemoryEntry, "id" | "createdAt">): Promise<MemoryEntry> {
    const normalized = normalizeSessionId(entry.sessionId);
    const list = await this.readSessionEntries(normalized);

    const persisted: MemoryEntry = {
      id: randomUUID(),
      sessionId: normalized,
      query: entry.query.trim(),
      answer: entry.answer.trim(),
      createdAt: Date.now(),
      metadata: entry.metadata,
    };

    list.push(persisted);
    await this.writeSessionEntries(normalized, list);

    return persisted;
  }

  async search(sessionId: string, query: string, limit = 3): Promise<MemorySearchResult[]> {
    const normalized = normalizeSessionId(sessionId);
    const entries = await this.readSessionEntries(normalized);
    const tokens = tokenize(query);

    if (tokens.size === 0) {
      return [];
    }

    const ranked = entries
      .map((entry) => ({
        entry,
        score: computeOverlapScore(tokens, tokenize(`${entry.query} ${entry.answer}`)),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.entry.createdAt - a.entry.createdAt);

    return ranked.slice(0, Math.max(1, Math.floor(limit)));
  }

  async list(sessionId: string, limit = 20): Promise<MemoryEntry[]> {
    const normalized = normalizeSessionId(sessionId);
    const entries = await this.readSessionEntries(normalized);
    const safeLimit = Math.max(1, Math.floor(limit));

    return entries.slice(-safeLimit).reverse();
  }

  async clearSession(sessionId: string): Promise<void> {
    const normalized = normalizeSessionId(sessionId);
    const file = this.resolveSessionPath(normalized);

    await rm(file, { force: true });
  }

  async clearAll(): Promise<void> {
    await rm(this.baseDir, { recursive: true, force: true });
  }

  private async readSessionEntries(sessionId: string): Promise<MemoryEntry[]> {
    const file = this.resolveSessionPath(sessionId);

    try {
      const raw = await readFile(file, "utf-8");
      const parsed = JSON.parse(raw) as unknown;

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter(isMemoryEntry);
    } catch {
      return [];
    }
  }

  private async writeSessionEntries(sessionId: string, entries: MemoryEntry[]): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
    const file = this.resolveSessionPath(sessionId);

    await writeFile(file, `${JSON.stringify(entries, null, 2)}\n`, "utf-8");
  }

  private resolveSessionPath(sessionId: string): string {
    return join(this.baseDir, `${sessionId}.json`);
  }
}

function normalizeSessionId(sessionId: string): string {
  const trimmed = sessionId.trim();

  if (trimmed.length === 0) {
    throw new Error("sessionId must be a non-empty string.");
  }

  return trimmed.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function tokenize(input: string): Set<string> {
  const values = input
    .normalize("NFKC")
    .toLowerCase()
    .match(/[a-z0-9]+/g);

  return new Set(values ?? []);
}

function computeOverlapScore(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let overlap = 0;

  for (const token of left) {
    if (right.has(token)) {
      overlap += 1;
    }
  }

  return Number((overlap / left.size).toFixed(4));
}

function isMemoryEntry(value: unknown): value is MemoryEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<MemoryEntry>;

  return (
    typeof item.id === "string" &&
    typeof item.sessionId === "string" &&
    typeof item.query === "string" &&
    typeof item.answer === "string" &&
    typeof item.createdAt === "number"
  );
}
