import { z } from "zod";

export const ExperimentRunMetadataSchema = z.object({
  experimentId: z.string(),
  schemaVersion: z.string(),
  createdAt: z.string(),
  datasetId: z.string(),
  datasetVersion: z.string(),
  pipelineName: z.string(),
  modelProvider: z.string().optional(),
  modelName: z.string().optional(),
  embeddingProvider: z.string().optional(),
  promptVersion: z.string().optional(),
  evalSuite: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ExperimentRunMetadata = z.infer<typeof ExperimentRunMetadataSchema>;
