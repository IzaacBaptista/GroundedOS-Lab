import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
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
  extractMultipart,
  parseMetadata,
  parsePositiveInteger,
  withTempUpload,
} from "../common/multipart";
import { RagService } from "./rag.service";

type FastifyMultipartRequest = FastifyRequest & {
  isMultipart(): boolean;
};

@Controller("rag")
export class RagController {
  constructor(private readonly rag: RagService) {}

  @Post("ask")
  @HttpCode(HttpStatus.OK)
  async ask(
    @Req() request: FastifyMultipartRequest,
    @Headers("content-type") contentType: string | undefined,
    @Body() body: unknown
  ): Promise<RagAskResponse> {
    if (request.isMultipart()) {
      return await this.handleMultipartAsk(request);
    }

    if (!contentType?.includes("application/json")) {
      throw new ApiRequestError(
        "Content-Type must be application/json or multipart/form-data.",
        415
      );
    }

    return await this.rag.ask(body as RagAskRequest);
  }

  @Post("index")
  @HttpCode(HttpStatus.OK)
  async index(
    @Req() request: FastifyMultipartRequest,
    @Headers("content-type") contentType: string | undefined,
    @Body() body: unknown
  ): Promise<RagIndexResponse> {
    if (request.isMultipart()) {
      return await this.handleMultipartIndex(request);
    }

    if (!contentType?.includes("application/json")) {
      throw new ApiRequestError(
        "Content-Type must be application/json or multipart/form-data.",
        415
      );
    }

    return await this.rag.index(body as RagIndexRequest);
  }

  private async handleMultipartAsk(request: FastifyRequest): Promise<RagAskResponse> {
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
      })
    );
  }

  private async handleMultipartIndex(request: FastifyRequest): Promise<RagIndexResponse> {
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
      })
    );
  }
}
