import { readFileSync } from 'node:fs';

/* UTF-8, semicolon-delimited, CRLF. Small and hand-maintained, so a full CSV
 * parser (quoting, embedded delimiters) would be more machinery than it earns.
 * Returns one object per body row, keyed by the header's column names. */
export function readRows(csvPath) {
  const rows = readFileSync(csvPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(';'));

  const [header, ...body] = rows;
  const columns = header.map((h) => h.trim());
  return body.map((cells) =>
    Object.fromEntries(columns.map((name, i) => [name, (cells[i] ?? '').trim()])),
  );
}
