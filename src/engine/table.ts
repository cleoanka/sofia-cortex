/**
 * A table is a node with role `table`; its cells live as JSON in `body`
 * (`{"rows":[["a","b"],["c","d"]]}`). Rectangular, at least 1×1.
 */
export type Cells = string[][];

export function parseTable(body: string): Cells {
  try {
    const v = JSON.parse(body) as { rows?: unknown };
    if (Array.isArray(v.rows) && v.rows.length) {
      const rows = v.rows.map((r) => (Array.isArray(r) ? r.map((x) => String(x ?? '')) : []));
      const w = Math.max(1, ...rows.map((r) => r.length));
      return rows.map((r) => [...r, ...Array(w - r.length).fill('')]);
    }
  } catch {
    // Not a table body — fall through to an empty grid.
  }
  return [
    ['', ''],
    ['', ''],
  ];
}

export const serializeTable = (rows: Cells): string => JSON.stringify({ rows });

export const addRow = (rows: Cells, at = rows.length): Cells => [...rows.slice(0, at), Array(rows[0]?.length ?? 1).fill(''), ...rows.slice(at)];
export const addColumn = (rows: Cells, at = rows[0]?.length ?? 0): Cells => rows.map((r) => [...r.slice(0, at), '', ...r.slice(at)]);
export const removeRow = (rows: Cells, at: number): Cells => (rows.length > 1 ? rows.filter((_, i) => i !== at) : rows);
export const removeColumn = (rows: Cells, at: number): Cells => ((rows[0]?.length ?? 0) > 1 ? rows.map((r) => r.filter((_, i) => i !== at)) : rows);

/** Rewrite every cell (link renames / unlinks) without touching the JSON around them. */
export const mapCells = (body: string, fn: (cell: string) => string): string => serializeTable(parseTable(body).map((r) => r.map(fn)));

/** Plain text of every cell — for previews and search snippets. */
export const tableText = (body: string): string =>
  parseTable(body)
    .flat()
    .map((x) => x.trim())
    .filter(Boolean)
    .join(' · ');

/** GitHub-flavoured Markdown, for the vault export. */
export function tableMarkdown(body: string): string {
  const rows = parseTable(body).map((r) => `| ${r.map((x) => x.replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`);
  const w = parseTable(body)[0].length;
  return [rows[0], `|${' --- |'.repeat(w)}`, ...rows.slice(1)].join('\n');
}
