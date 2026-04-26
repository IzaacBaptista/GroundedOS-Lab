/**
 * Ingestion Dispatcher
 *
 * The single public entry point for the ETL pipeline. Accepts any
 * {@link IngestionInput}, selects the appropriate {@link Extractor} from the
 * built-in registry, and returns a {@link NormalizedDocument}.
 *
 * To add support for a new modality:
 *   1. Implement the `Extractor` interface in `src/extractors/<modality>.ts`.
 *   2. Register an instance in the `EXTRACTOR_REGISTRY` array below.
 */
import type { IngestionInput, NormalizedDocument } from "@groundedos/core";
/**
 * Ingest any content and return a `NormalizedDocument`.
 *
 * @param input - Unified ingestion descriptor describing the source material.
 * @returns A fully populated `NormalizedDocument` ready for chunking /
 *          embedding / retrieval.
 * @throws If no extractor is registered for `input.type`, or if the selected
 *         extractor fails during extraction.
 *
 * @example
 * ```ts
 * import { ingest } from "@groundedos/etl";
 *
 * const doc = await ingest({
 *   type: "text",
 *   content: "Hello world\n\nThis is a second paragraph.",
 *   metadata: { title: "My first document" },
 * });
 * ```
 */
export declare function ingest(input: IngestionInput): Promise<NormalizedDocument>;
