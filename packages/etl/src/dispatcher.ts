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

import type { Extractor, IngestionInput, NormalizedDocument } from "@groundedos/core";

import { AudioExtractor } from "./extractors/audio";
import { ImageExtractor } from "./extractors/image";
import { PdfExtractor } from "./extractors/pdf";
import { TextExtractor } from "./extractors/text";

/**
 * All registered extractors, consulted in order.
 *
 * The dispatcher selects the first extractor whose `supportedModalities`
 * includes `input.type`. Adding a new entry here is the only change required
 * to register a new modality.
 */
const EXTRACTOR_REGISTRY: Extractor[] = [
  new TextExtractor(),
  new PdfExtractor(),
  new ImageExtractor(),
  new AudioExtractor(),
];

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
export async function ingest(input: IngestionInput): Promise<NormalizedDocument> {
  const extractor = EXTRACTOR_REGISTRY.find((e) =>
    e.supportedModalities.includes(input.type)
  );

  if (!extractor) {
    throw new Error(
      `[dispatcher] No extractor registered for modality "${input.type}". ` +
        `Registered modalities: ${EXTRACTOR_REGISTRY.flatMap((e) => e.supportedModalities).join(", ")}.`
    );
  }

  return extractor.extract(input);
}
