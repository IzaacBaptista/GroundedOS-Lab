import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { StreamEvent } from "./realtime.types";

export class ClientSessionManager {
  private readonly sessions = new Map<string, { userId?: string; createdAt: string }>();

  create(userId?: string): string {
    const id = `rt-${randomUUID()}`;
    this.sessions.set(id, { userId, createdAt: new Date().toISOString() });
    return id;
  }

  exists(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }
}

export class SubscriptionManager {
  private readonly subscriptions = new Map<string, Set<string>>();

  subscribe(sessionId: string, scope: string): void {
    const current = this.subscriptions.get(sessionId) ?? new Set<string>();
    current.add(scope);
    this.subscriptions.set(sessionId, current);
  }

  list(sessionId: string): string[] {
    return [...(this.subscriptions.get(sessionId) ?? new Set<string>())];
  }
}

type EventHandler = (event: StreamEvent) => void;

export class WebSocketEventBus {
  private readonly listeners = new Map<string, Set<EventHandler>>();

  publish(scope: string, event: StreamEvent): void {
    const handlers = this.listeners.get(scope);
    if (!handlers) {
      return;
    }
    handlers.forEach((handler) => handler(event));
  }

  subscribe(scope: string, handler: EventHandler): () => void {
    const handlers = this.listeners.get(scope) ?? new Set<EventHandler>();
    handlers.add(handler);
    this.listeners.set(scope, handlers);
    return () => {
      const existing = this.listeners.get(scope);
      existing?.delete(handler);
    };
  }
}

export class EventPublisher {
  constructor(private readonly bus: WebSocketEventBus) {}

  publish(scope: string, event: StreamEvent): void {
    this.bus.publish(scope, event);
  }
}

@Injectable()
export class RealtimeGateway {
  readonly sessions = new ClientSessionManager();
  readonly subscriptions = new SubscriptionManager();
  readonly bus = new WebSocketEventBus();
  readonly publisher = new EventPublisher(this.bus);

  connect(userId?: string): {
    sessionId: string;
    transport: "websocket";
    endpoint: string;
    heartbeatMs: number;
    reconnect: { supported: boolean; retryAfterMs: number };
  } {
    return {
      sessionId: this.sessions.create(userId),
      transport: "websocket",
      endpoint: "/ws/connect",
      heartbeatMs: 15_000,
      reconnect: {
        supported: true,
        retryAfterMs: 1_000,
      },
    };
  }
}
