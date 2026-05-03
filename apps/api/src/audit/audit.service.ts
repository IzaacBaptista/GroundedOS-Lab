import { Injectable } from "@nestjs/common";
import {
  createAuditStore,
  type AuditEvent,
  type AuditEventInput,
  type AuditLogQuery,
  type AuditStore,
} from "./audit-store";

@Injectable()
export class AuditService {
  private readonly store: AuditStore = createAuditStore();

  record(event: AuditEventInput): Promise<AuditEvent> {
    return this.store.append(event);
  }

  list(query?: AuditLogQuery): Promise<AuditEvent[]> {
    return this.store.list(query);
  }
}
