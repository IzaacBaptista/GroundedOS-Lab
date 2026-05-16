import type { Phase6JobType } from "./job-queue";

export interface RedriveAuditEntry {
  dlqJobId: string;
  jobType: Phase6JobType;
  redrivenAt: string;
  redrivenBy?: string;
  status: "scheduled" | "failed";
  reason?: string;
  newJobId?: string;
}

export interface RedriveHistory {
  total: number;
  successful: number;
  failed: number;
  entries: RedriveAuditEntry[];
}

/**
 * Audit store for DLQ re-drive operations.
 * Tracks all re-drive attempts with metadata for operational transparency.
 *
 * NOTE: Currently in-memory. For production:
 * - Persist to Redis or database
 * - Add TTL (90 days)
 * - Enable multi-instance querying
 */
export class RedriveAuditStore {
  private readonly entries: RedriveAuditEntry[] = [];

  /**
   * Record a re-drive attempt.
   */
  record(entry: RedriveAuditEntry): void {
    this.entries.push(entry);
  }

  /**
   * Get full re-drive history.
   */
  getHistory(limit: number = 100, offset: number = 0): RedriveHistory {
    const sliced = this.entries.slice(offset, offset + limit);

    return {
      total: this.entries.length,
      successful: this.entries.filter((e) => e.status === "scheduled").length,
      failed: this.entries.filter((e) => e.status === "failed").length,
      entries: sliced,
    };
  }

  /**
   * Get history by job type.
   */
  getHistoryByJobType(jobType: Phase6JobType): RedriveHistory {
    const filtered = this.entries.filter((e) => e.jobType === jobType);

    return {
      total: filtered.length,
      successful: filtered.filter((e) => e.status === "scheduled").length,
      failed: filtered.filter((e) => e.status === "failed").length,
      entries: filtered,
    };
  }

  /**
   * Get re-drive entry by ID.
   */
  getEntry(dlqJobId: string): RedriveAuditEntry | undefined {
    return this.entries.find((e) => e.dlqJobId === dlqJobId);
  }
}
