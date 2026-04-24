import { Inject, Injectable, Optional } from "@nestjs/common";

/**
 * Injection token that carries the optional runtime configuration of the API.
 * Equivalent to the {@code createApiServer({ indexDir })} option from the
 * previous Fastify-based entry point — tests use this to point persisted RAG
 * indexes at a temporary directory.
 */
export const API_CONFIG = Symbol("API_CONFIG");

export interface ApiConfig {
  indexDir?: string;
}

@Injectable()
export class ApiConfigService {
  private readonly config: ApiConfig;

  constructor(@Optional() @Inject(API_CONFIG) config?: ApiConfig) {
    this.config = config ?? {};
  }

  get indexDir(): string | undefined {
    return this.config.indexDir;
  }
}
