/**
 * Extractor Contract
 *
 * Every modality-specific extractor in the ETL package must implement this
 * interface. The dispatcher uses `supportedModalities` to route an
 * `IngestionInput` to the correct extractor at runtime.
 */

import type { DocumentModality, NormalizedDocument } from "./document";
import type { IngestionInput } from "./ingestion";

/**
 * The single contract that every extractor must fulfil.
 *
 * Implementing classes receive an {@link IngestionInput} and asynchronously
 * produce a {@link NormalizedDocument} ready for downstream pipeline stages
 * (chunking, embedding, retrieval).
 *
 * @example
 * ```ts
 * class MyExtractor implements Extractor {
 *   readonly supportedModalities: DocumentModality[] = ["text"];
 *
 *   async extract(input: IngestionInput): Promise<NormalizedDocument> {
 *     // ... implementation
 *   }
 * }
 * ```
 */
export interface Extractor {
  /**
   * The list of modalities this extractor can handle.
   *
   * The dispatcher iterates the registered extractors and selects the first
   * one whose `supportedModalities` includes `input.type`. Keep this list
   * narrow — prefer one extractor per modality to avoid ambiguity.
   */
  readonly supportedModalities: DocumentModality[];

  /**
   * Extract and normalize the content described by `input`.
   *
   * @param input - Unified ingestion descriptor supplied by the caller.
   * @returns A fully populated `NormalizedDocument`.
   * @throws If the input is invalid or extraction fails.
   */
  extract(input: IngestionInput): Promise<NormalizedDocument>;
}
