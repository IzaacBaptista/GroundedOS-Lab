/**
 * Renders a table (row-major string grid, as returned by pdf-parse's
 * `getTable()`) as GitHub-flavored Markdown, preserving the row/column
 * structure that a flat text dump of the table would destroy (book cap. 6,
 * "Extração de tabelas").
 */
export function renderTableAsMarkdown(rows: string[][]): string {
  if (rows.length === 0) {
    return "";
  }

  const columnCount = rows[0]!.length;
  const escapeCell = (cell: string | undefined) => (cell ?? "").replace(/\|/g, "\\|").trim();
  const renderRow = (row: string[]) =>
    `| ${Array.from({ length: columnCount }, (_, i) => escapeCell(row[i])).join(" | ")} |`;

  const [header, ...body] = rows;
  const separator = `| ${Array(columnCount).fill("---").join(" | ")} |`;

  return [renderRow(header!), separator, ...body.map(renderRow)].join("\n");
}
