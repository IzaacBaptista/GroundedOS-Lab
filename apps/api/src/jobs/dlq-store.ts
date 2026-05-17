import type { Phase6DlqEnvelope, Phase6JobType } from "./job-queue";

export interface DlqListFilter {
  jobType?: Phase6JobType;
  limit?: number;
  offset?: number;
}

export interface DlqInspectionResult {
  dlqJobId: string;
  envelope: Phase6DlqEnvelope;
  createdAt: string;
}

export interface DlqRedriveResult {
  dlqJobId: string;
  dryRun: boolean;
  status: "scheduled" | "skipped";
  reason?: string;
}

/**
 * DLQ Store: In-memory store for dead-letter queue entries.
 *
 * NOTE: This is a temporary implementation. For production:
 * - Migrate to Redis Hash or dedicated DLQ table
 * - Add TTL (e.g., 30 days) to prevent unbounded growth
 * - Consider multi-instance replication or WAL for durability
 *
 * Current: Stores DLQ entries indexed by dlqJobId.
 */
export class DlqStore {
  private readonly entries = new Map<string, { envelope: Phase6DlqEnvelope; createdAt: string }>();

  /**
   * Add or update a DLQ entry.
   */
  add(dlqJobId: string, envelope: Phase6DlqEnvelope): void {
    this.entries.set(dlqJobId, {
      envelope,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Get a single DLQ entry by ID.
   */
  get(dlqJobId: string): DlqInspectionResult | null {
    const entry = this.entries.get(dlqJobId);
    if (!entry) {
      return null;
    }

    return {
      dlqJobId,
      envelope: entry.envelope,
      createdAt: entry.createdAt,
    };
  }

  /**
   * List DLQ entries with optional filtering and pagination.
   */
  list(filter: DlqListFilter = {}): DlqInspectionResult[] {
    const { jobType, limit = 100, offset = 0 } = filter;

    let items = Array.from(this.entries.entries()).map(([dlqJobId, entry]) => ({
      dlqJobId,
      envelope: entry.envelope,
      createdAt: entry.createdAt,
    }));

    if (jobType) {
      items = items.filter((item) => item.envelope.jobType === jobType);
    }

    return items.slice(offset, offset + limit);
  }

  /**
   * Mark a DLQ entry for re-drive (removal from store, so it can be re-queued).
   * In a real system, this would trigger a re-drive operation.
   *
   * @param dlqJobId - The DLQ job ID to re-drive
   * @param dryRun - If true, just validate without removing
   * @returns Re-drive result
   */
  redrive(dlqJobId: string, dryRun: boolean = false): DlqRedriveResult {
    const entry = this.entries.get(dlqJobId);
    if (!entry) {
      return {
        dlqJobId,
        dryRun,
        status: "skipped",
        reason: "DLQ entry not found",
      };
    }

    if (dryRun) {
      return {
        dlqJobId,
        dryRun: true,
        status: "skipped",
        reason: "Dry-run mode: no action taken",
      };
    }

    // In production, this would re-enqueue the job and remove the DLQ entry
    // For now, just mark as scheduled
    this.entries.delete(dlqJobId);

    return {
      dlqJobId,
      dryRun: false,
      status: "scheduled",
    };
  }

  /**
   * Get count of all DLQ entries.
   */
  count(): number {
    return this.entries.size;
  }

  /**
   * Count by job type.
   */
  countByJobType(): Record<Phase6JobType, number> {
    const counts: Record<Phase6JobType, number> = {
      "phase5-experiment": 0,
      "model-benchmark": 0,
    };

    for (const entry of this.entries.values()) {
      counts[entry.envelope.jobType] += 1;
    }

    return counts;
  }

  /**
   * Clear all entries (for testing only).
   */
  clear(): void {
    this.entries.clear();
  }
}
