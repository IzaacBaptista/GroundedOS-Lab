import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { ApiRequestError } from "../errors";
import type {
  RagAskFileRequest,
  RagAskRequest,
  RagAskResponse,
  RagIndexFileRequest,
  RagIndexRequest,
  RagIndexResponse,
} from "../rag-service";
import {
  RagAskRequestBodySchema,
  RagIndexRequestBodySchema,
  validateApiInput,
} from "@groundedos/core";
import {
  extractMultipart,
  parseBoolean,
  parseMetadata,
  parsePositiveInteger,
  withTempUpload,
} from "../common/multipart";
import { getRequestUserId } from "../common/auth-context";
import { RagService } from "./rag.service";

type FastifyMultipartRequest = FastifyRequest & {
  isMultipart(): boolean;
};

@Controller("rag")
export class RagController {
  constructor(@Inject(RagService) private readonly rag: RagService) {}

  @Post("ask")
  @HttpCode(HttpStatus.OK)
  async ask(
    @Req() request: FastifyMultipartRequest,
    @Headers("content-type") contentType: string | undefined,
    @Body() body: unknown
  ): Promise<RagAskResponse> {
    const ownerId = getRequestUserId(request);

    if (request.isMultipart()) {
      return await this.handleMultipartAsk(request, ownerId);
    }

    if (!contentType?.includes("application/json")) {
      throw new ApiRequestError(
        "Content-Type must be application/json or multipart/form-data.",
        415
      );
    }

    // Strict schema validation for JSON body — rejects unknown fields and
    // enforces required fields before reaching service logic.
    const validated = validateApiInput<RagAskRequest>(
      "RagAskRequest",
      RagAskRequestBodySchema,
      body
    );

    return await this.rag.ask({
      ...validated,
      ownerId,
    });
  }

  @Post("index")
  @HttpCode(HttpStatus.OK)
  async index(
    @Req() request: FastifyMultipartRequest,
    @Headers("content-type") contentType: string | undefined,
    @Body() body: unknown
  ): Promise<RagIndexResponse> {
    const ownerId = getRequestUserId(request);

    if (request.isMultipart()) {
      return await this.handleMultipartIndex(request, ownerId);
    }

    if (!contentType?.includes("application/json")) {
      throw new ApiRequestError(
        "Content-Type must be application/json or multipart/form-data.",
        415
      );
    }

    // Strict schema validation for JSON body.
    const validated = validateApiInput<RagIndexRequest>(
      "RagIndexRequest",
      RagIndexRequestBodySchema,
      body
    );

    return await this.rag.index({
      ...validated,
      ownerId,
    });
  }

  private async handleMultipartAsk(
    request: FastifyRequest,
    ownerId?: string
  ): Promise<RagAskResponse> {
    const { fields, upload } = await extractMultipart(request);

    return await withTempUpload(upload, (tempFilePath) =>
      this.rag.askFromFile({
        filePath: tempFilePath,
        originalFilename: upload.filename,
        type: fields.type as RagAskFileRequest["type"],
        query: fields.query,
        sessionId: fields.sessionId,
        topK: parsePositiveInteger(fields.topK, "topK"),
        title: fields.title,
        documentId: fields.documentId,
        metadata: parseMetadata(fields.metadata),
        embeddingProvider: fields.embeddingProvider as RagAskFileRequest["embeddingProvider"],
        useMultiModelOrchestration: parseBoolean(
          fields.useMultiModelOrchestration,
          "useMultiModelOrchestration"
        ),
        reasoningEnabled: parseBoolean(fields.reasoningEnabled, "reasoningEnabled"),
        enableShadowRetrieval: parseBoolean(
          fields.enableShadowRetrieval,
          "enableShadowRetrieval"
        ),
        ownerId,
      })
    );
  }

  private async handleMultipartIndex(
    request: FastifyRequest,
    ownerId?: string
  ): Promise<RagIndexResponse> {
    const { fields, upload } = await extractMultipart(request);

    return await withTempUpload(upload, (tempFilePath) =>
      this.rag.indexFromFile({
        filePath: tempFilePath,
        originalFilename: upload.filename,
        type: fields.type as RagIndexFileRequest["type"],
        title: fields.title,
        documentId: fields.documentId,
        metadata: parseMetadata(fields.metadata),
        embeddingProvider: fields.embeddingProvider as RagIndexFileRequest["embeddingProvider"],
        ownerId,
      })
    );
  }
}
