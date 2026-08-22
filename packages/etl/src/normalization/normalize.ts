/**
 * Document normalization (book cap. 7): the cleanup pass between extraction
 * and chunking. Runs on every ingested document regardless of modality —
 * fixes mojibake encoding, strips control-character noise, removes repeated
 * header/footer lines across page-like sections, collapses whitespace, and
 * drops exact-duplicate sections. Without this step, a paginated PDF with a
 * header on every page indexes that header dozens of times.
 */

import type { DocumentSection, NormalizedDocument } from "@groundedos/core";

const DEFAULT_HEADER_FOOTER_MIN_REPEAT_RATIO = 0.5;
const DEFAULT_HEADER_FOOTER_MAX_LINE_LENGTH = 120;
const DEFAULT_MIN_SECTIONS_FOR_HEADER_FOOTER_DETECTION = 3;
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const MOJIBAKE_PATTERN = /Ã[-¿]/;

export interface NormalizeOptions {
  headerFooterMinRepeatRatio?: number;
  headerFooterMaxLineLength?: number;
  minSectionsForHeaderFooterDetection?: number;
}

export interface NormalizeTrace {
  removedHeaderLines: string[];
  removedFooterLines: string[];
  removedDuplicateSectionIds: string[];
  encodingFixesApplied: number;
}

export interface NormalizeResult {
  document: NormalizedDocument;
  trace: NormalizeTrace;
}

export function normalizeDocument(
  document: NormalizedDocument,
  options: NormalizeOptions = {}
): NormalizeResult {
  const config = {
    headerFooterMinRepeatRatio:
      options.headerFooterMinRepeatRatio ?? DEFAULT_HEADER_FOOTER_MIN_REPEAT_RATIO,
    headerFooterMaxLineLength:
      options.headerFooterMaxLineLength ?? DEFAULT_HEADER_FOOTER_MAX_LINE_LENGTH,
    minSectionsForHeaderFooterDetection:
      options.minSectionsForHeaderFooterDetection ??
      DEFAULT_MIN_SECTIONS_FOR_HEADER_FOOTER_DETECTION,
  };

  const trace: NormalizeTrace = {
    removedHeaderLines: [],
    removedFooterLines: [],
    removedDuplicateSectionIds: [],
    encodingFixesApplied: 0,
  };

  let encodingFixes = 0;
  let sections = document.content.sections.map((section) => {
    const fixed = fixMojibake(section.text);
    if (fixed !== section.text) {
      encodingFixes += 1;
    }
    return { ...section, text: cleanText(fixed) };
  });
  trace.encodingFixesApplied = encodingFixes;

  sections = stripRepeatedBoundaryLines(sections, config, trace);

  const deduped: DocumentSection[] = [];
  const seenTexts = new Set<string>();
  for (const section of sections) {
    const trimmed = section.text.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (seenTexts.has(trimmed)) {
      trace.removedDuplicateSectionIds.push(section.id);
      continue;
    }
    seenTexts.add(trimmed);
    deduped.push({ ...section, text: trimmed });
  }

  const { fullText, sections: rebuiltSections } = rebuildOffsets(deduped);

  return {
    document: {
      ...document,
      content: { fullText, sections: rebuiltSections },
    },
    trace,
  };
}

function cleanText(text: string): string {
  return text
    .replace(CONTROL_CHAR_PATTERN, " ")
    .normalize("NFKC")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fixMojibake(text: string): string {
  if (!MOJIBAKE_PATTERN.test(text)) {
    return text;
  }

  try {
    const repaired = Buffer.from(text, "latin1").toString("utf8");
    if (!repaired.includes("�") && !MOJIBAKE_PATTERN.test(repaired)) {
      return repaired;
    }
  } catch {
    // fall through to original text
  }

  return text;
}

function stripRepeatedBoundaryLines(
  sections: DocumentSection[],
  config: Required<NormalizeOptions>,
  trace: NormalizeTrace
): DocumentSection[] {
  if (sections.length < config.minSectionsForHeaderFooterDetection) {
    return sections;
  }

  const firstLines = sections.map((s) => firstNonEmptyLine(s.text));
  const lastLines = sections.map((s) => lastNonEmptyLine(s.text));

  const header = mostRepeatedLine(firstLines, sections.length, config);
  const footer = mostRepeatedLine(lastLines, sections.length, config);

  if (header) {
    trace.removedHeaderLines.push(header.sample);
  }
  if (footer && footer.pattern !== header?.pattern) {
    trace.removedFooterLines.push(footer.sample);
  }

  if (!header && !footer) {
    return sections;
  }

  return sections.map((section) => {
    const lines = section.text.split("\n");
    if (header && lines.length > 1 && normalizeLineForCompare(lines[0]?.trim() ?? "") === header.pattern) {
      lines.shift();
    }
    if (
      footer &&
      lines.length > 1 &&
      normalizeLineForCompare(lines[lines.length - 1]?.trim() ?? "") === footer.pattern
    ) {
      lines.pop();
    }
    return { ...section, text: lines.join("\n").trim() };
  });
}

/** Numbers (e.g. page numbers) vary per page, so headers/footers are matched by pattern, not literal text. */
function normalizeLineForCompare(line: string): string {
  return line.replace(/\d+/g, "#");
}

interface RepeatedLineMatch {
  pattern: string;
  sample: string;
}

function mostRepeatedLine(
  lines: Array<string | undefined>,
  sectionCount: number,
  config: Required<NormalizeOptions>
): RepeatedLineMatch | undefined {
  const counts = new Map<string, { count: number; sample: string }>();
  for (const line of lines) {
    if (!line || line.length === 0 || line.length > config.headerFooterMaxLineLength) {
      continue;
    }
    const pattern = normalizeLineForCompare(line);
    const entry = counts.get(pattern) ?? { count: 0, sample: line };
    entry.count += 1;
    counts.set(pattern, entry);
  }

  let best: RepeatedLineMatch | undefined;
  let bestCount = 0;
  for (const [pattern, entry] of counts) {
    if (entry.count > bestCount) {
      best = { pattern, sample: entry.sample };
      bestCount = entry.count;
    }
  }

  if (best && bestCount / sectionCount >= config.headerFooterMinRepeatRatio) {
    return best;
  }
  return undefined;
}

function firstNonEmptyLine(text: string): string | undefined {
  return text.split("\n").find((line) => line.trim().length > 0)?.trim();
}

function lastNonEmptyLine(text: string): string | undefined {
  const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  return lines[lines.length - 1];
}

function rebuildOffsets(sections: DocumentSection[]): {
  fullText: string;
  sections: DocumentSection[];
} {
  let fullText = "";
  const rebuilt: DocumentSection[] = [];

  for (const section of sections) {
    const separator = fullText.length > 0 ? "\n\n" : "";
    const startOffset = fullText.length + separator.length;
    fullText += `${separator}${section.text}`;
    rebuilt.push({ ...section, startOffset, endOffset: startOffset + section.text.length });
  }

  return { fullText, sections: rebuilt };
}
