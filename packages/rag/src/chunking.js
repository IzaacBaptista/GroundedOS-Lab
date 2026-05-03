const ERROR_PREFIX = "[rag/chunking]";
const DEFAULT_MAX_CHUNK_CHARS = 800;
const DEFAULT_OVERLAP_CHARS = 100;
export function chunkDocument(document, options = {}) {
    const resolvedOptions = resolveOptions(options);
    const chunks = [];
    let chunkIndex = 0;
    for (const section of document.content.sections) {
        if (section.text.trim().length === 0) {
            continue;
        }
        const offsetBasis = typeof section.startOffset === "number" ? "document" : "section";
        const sectionBaseOffset = offsetBasis === "document" ? section.startOffset ?? 0 : 0;
        let sectionChunkIndex = 0;
        for (const slice of sliceSectionText(section.text, resolvedOptions)) {
            sectionChunkIndex += 1;
            chunkIndex += 1;
            chunks.push({
                id: `${document.documentId}:${section.id}:chunk-${sectionChunkIndex}`,
                documentId: document.documentId,
                sectionId: section.id,
                text: slice.text,
                startOffset: sectionBaseOffset + slice.startOffset,
                endOffset: sectionBaseOffset + slice.endOffset,
                metadata: {
                    documentTitle: document.title,
                    modality: document.modality,
                    sectionHeading: section.heading,
                    page: section.page,
                    sourceType: document.lineage.sourceType,
                    originalFilename: document.lineage.originalFilename,
                    chunkIndex,
                    sectionChunkIndex,
                    offsetBasis,
                },
            });
        }
    }
    return chunks;
}
function resolveOptions(options) {
    const maxChunkChars = options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS;
    const overlapChars = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;
    if (!Number.isInteger(maxChunkChars) || maxChunkChars <= 0) {
        throw new Error(`${ERROR_PREFIX} maxChunkChars must be a positive integer.`);
    }
    if (!Number.isInteger(overlapChars) || overlapChars < 0) {
        throw new Error(`${ERROR_PREFIX} overlapChars must be an integer greater than or equal to 0.`);
    }
    if (overlapChars >= maxChunkChars) {
        throw new Error(`${ERROR_PREFIX} overlapChars must be smaller than maxChunkChars.`);
    }
    return { maxChunkChars, overlapChars };
}
function sliceSectionText(text, options) {
    const slices = [];
    const step = options.maxChunkChars - options.overlapChars;
    let rawStartOffset = 0;
    while (rawStartOffset < text.length) {
        const rawEndOffset = Math.min(rawStartOffset + options.maxChunkChars, text.length);
        const rawText = text.slice(rawStartOffset, rawEndOffset);
        const trimmedText = rawText.trim();
        if (trimmedText.length > 0) {
            const leadingTrimChars = rawText.length - rawText.trimStart().length;
            const trailingTrimChars = rawText.length - rawText.trimEnd().length;
            slices.push({
                text: trimmedText,
                startOffset: rawStartOffset + leadingTrimChars,
                endOffset: rawEndOffset - trailingTrimChars,
            });
        }
        if (rawEndOffset === text.length) {
            break;
        }
        rawStartOffset += step;
    }
    return slices;
}
//# sourceMappingURL=chunking.js.map