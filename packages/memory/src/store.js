import { randomUUID } from "crypto";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
const DEFAULT_MEMORY_DIR = ".groundedos/memory/sessions";
export class FileSessionMemoryStore {
    baseDir;
    constructor(baseDir = DEFAULT_MEMORY_DIR) {
        this.baseDir = baseDir;
    }
    async append(entry) {
        const normalized = normalizeSessionId(entry.sessionId);
        const list = await this.readSessionEntries(normalized);
        const persisted = {
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
    async search(sessionId, query, limit = 3) {
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
    async list(sessionId, limit = 20) {
        const normalized = normalizeSessionId(sessionId);
        const entries = await this.readSessionEntries(normalized);
        const safeLimit = Math.max(1, Math.floor(limit));
        return entries.slice(-safeLimit).reverse();
    }
    async clearSession(sessionId) {
        const normalized = normalizeSessionId(sessionId);
        const file = this.resolveSessionPath(normalized);
        await rm(file, { force: true });
    }
    async clearAll() {
        await rm(this.baseDir, { recursive: true, force: true });
    }
    async readSessionEntries(sessionId) {
        const file = this.resolveSessionPath(sessionId);
        try {
            const raw = await readFile(file, "utf-8");
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                return [];
            }
            return parsed.filter(isMemoryEntry);
        }
        catch {
            return [];
        }
    }
    async writeSessionEntries(sessionId, entries) {
        await mkdir(this.baseDir, { recursive: true });
        const file = this.resolveSessionPath(sessionId);
        await writeFile(file, `${JSON.stringify(entries, null, 2)}\n`, "utf-8");
    }
    resolveSessionPath(sessionId) {
        return join(this.baseDir, `${sessionId}.json`);
    }
}
function normalizeSessionId(sessionId) {
    const trimmed = sessionId.trim();
    if (trimmed.length === 0) {
        throw new Error("sessionId must be a non-empty string.");
    }
    return trimmed.replace(/[^a-zA-Z0-9_-]/g, "_");
}
function tokenize(input) {
    const values = input
        .normalize("NFKC")
        .toLowerCase()
        .match(/[a-z0-9]+/g);
    return new Set(values ?? []);
}
function computeOverlapScore(left, right) {
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
function isMemoryEntry(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const item = value;
    return (typeof item.id === "string" &&
        typeof item.sessionId === "string" &&
        typeof item.query === "string" &&
        typeof item.answer === "string" &&
        typeof item.createdAt === "number");
}
//# sourceMappingURL=store.js.map