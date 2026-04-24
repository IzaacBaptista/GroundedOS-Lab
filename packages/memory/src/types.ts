export interface MemoryEntry {
  id: string;
  sessionId: string;
  query: string;
  answer: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
}

export interface SessionMemoryStore {
  append(entry: Omit<MemoryEntry, "id" | "createdAt">): Promise<MemoryEntry>;
  search(sessionId: string, query: string, limit?: number): Promise<MemorySearchResult[]>;
  list(sessionId: string, limit?: number): Promise<MemoryEntry[]>;
  clearSession(sessionId: string): Promise<void>;
  clearAll(): Promise<void>;
}
