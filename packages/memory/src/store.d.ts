import type { MemoryEntry, MemorySearchResult, SessionMemoryStore } from "./types";
export declare class FileSessionMemoryStore implements SessionMemoryStore {
    private readonly baseDir;
    constructor(baseDir?: string);
    append(entry: Omit<MemoryEntry, "id" | "createdAt">): Promise<MemoryEntry>;
    search(sessionId: string, query: string, limit?: number): Promise<MemorySearchResult[]>;
    list(sessionId: string, limit?: number): Promise<MemoryEntry[]>;
    clearSession(sessionId: string): Promise<void>;
    clearAll(): Promise<void>;
    private readSessionEntries;
    private writeSessionEntries;
    private resolveSessionPath;
}
