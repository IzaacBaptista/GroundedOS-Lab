/**
 * Renders a parsed JSON/XML value as indented "key: value" text that
 * preserves the source's hierarchy (book cap. 6, "Documentos estruturados") —
 * the alternative to flattening a nested object into a single line of text,
 * which discards the relationship between fields that the format already
 * made explicit.
 */
export function renderStructuredValue(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);

  if (Array.isArray(value)) {
    return renderArray(value, indent);
  }

  if (value !== null && typeof value === "object") {
    return renderObject(value as Record<string, unknown>, indent);
  }

  return `${pad}${formatScalar(value)}`;
}

function renderObject(obj: Record<string, unknown>, indent: number): string {
  const pad = "  ".repeat(indent);
  const entries = Object.entries(obj);

  if (entries.length === 0) {
    return `${pad}(empty object)`;
  }

  return entries
    .map(([key, val]) => {
      if (isEmptyComposite(val)) {
        return `${pad}${key}: ${Array.isArray(val) ? "(empty list)" : "(empty object)"}`;
      }
      if (isComposite(val)) {
        return `${pad}${key}:\n${renderStructuredValue(val, indent + 1)}`;
      }
      return `${pad}${key}: ${formatScalar(val)}`;
    })
    .join("\n");
}

function renderArray(arr: unknown[], indent: number): string {
  const pad = "  ".repeat(indent);

  if (arr.length === 0) {
    return `${pad}(empty list)`;
  }

  return arr
    .map((item, index) => {
      if (isEmptyComposite(item)) {
        return `${pad}- [${index}]: ${Array.isArray(item) ? "(empty list)" : "(empty object)"}`;
      }
      if (isComposite(item)) {
        return `${pad}- [${index}]\n${renderStructuredValue(item, indent + 1)}`;
      }
      return `${pad}- ${formatScalar(item)}`;
    })
    .join("\n");
}

function isComposite(value: unknown): value is Record<string, unknown> | unknown[] {
  return value !== null && typeof value === "object";
}

function isEmptyComposite(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return isComposite(value) && Object.keys(value).length === 0;
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) {
    return "(empty)";
  }
  return String(value);
}
