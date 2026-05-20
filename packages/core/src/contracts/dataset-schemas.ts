import { z } from "zod";

export const DatasetEntrySchema = z.object({
  id: z.string(),
  question: z.string(),
  context: z.string().optional(),
  expectedAnswer: z.string().optional(),
  expectedChunkIds: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type DatasetEntry = z.infer<typeof DatasetEntrySchema>;

export const DatasetSchema = z.object({
  name: z.string(),
  version: z.string(),
  createdAt: z.string().optional(),
  source: z.string().optional(),
  entries: z.array(DatasetEntrySchema),
});

export type DatasetSchemaType = z.infer<typeof DatasetSchema>;
export type GoldenDataset = DatasetSchemaType;
