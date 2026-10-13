export type Engine = "sqlite" | "duckdb" | "pglite";
export type Cell = string | number | boolean | null;
export type Dataset = { columns: string[]; rows: Cell[][]; types: ("DOUBLE PRECISION" | "TEXT")[] };
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_ROWS = 20_000;
export const MAX_RESULT_ROWS = 1000;
export const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
export const tableName = (file: string) => file.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_").replace(/^[0-9]/, "_$&") || "dataset";

export function parseCSV(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else cell += ch;
    } else if (ch === '"' && cell === "" && !closed) quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ""; closed = false; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = ""; closed = false;
      if (rows.length > MAX_ROWS + 1) throw new Error(`Datasets are limited to ${MAX_ROWS.toLocaleString()} rows.`);
    } else {
      if (closed || ch === '"') throw new Error("Invalid CSV quoting.");
      cell += ch;
    }
  }
  if (quoted) throw new Error("Unclosed quote in CSV.");
  if (cell || row.length || closed) { row.push(cell); rows.push(row); }
  return rows;
}

export function parseDataset(name: string, text: string): Dataset {
  let columns: string[], rows: Cell[][];
  if (/\.(json|jsonl|ndjson)$/i.test(name)) {
    const data: unknown = /\.(jsonl|ndjson)$/i.test(name) ? text.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line)) : JSON.parse(text);
    if (!Array.isArray(data) || !data.length || data.some(r => !r || typeof r !== "object" || Array.isArray(r)))
      throw new Error("JSON must be a nonempty array of objects.");
    columns = [...new Set(data.flatMap(r => Object.keys(r)))];
    rows = data.map(r => columns.map(c => {
      const v: unknown = r[c];
      return v == null ? null : typeof v === "object" ? JSON.stringify(v) : v as Cell;
    }));
  } else if (/\.(csv|tsv)$/i.test(name)) {
    const csv = parseCSV(text, /\.tsv$/i.test(name) ? "\t" : ",");
    columns = csv.shift()?.map(c => c.trim()) ?? [];
    rows = csv.map((r, i) => {
      if (r.length !== columns.length) throw new Error(`CSV row ${i + 2} has ${r.length} fields; expected ${columns.length}.`);
      return r.map(v => v === "" ? null : v);
    });
  } else throw new Error("Choose a CSV, TSV, JSON, JSONL, or NDJSON file.");
  if (!columns.length || columns.length > 100 || columns.some(c => !c || c.includes("\0")) || new Set(columns.map(c => c.toLowerCase())).size !== columns.length)
    throw new Error("Use 1–100 unique, nonempty column names.");
  if (rows.length > MAX_ROWS) throw new Error(`Datasets are limited to ${MAX_ROWS.toLocaleString()} rows.`);
  const numeric = (v: Cell) => typeof v === "number" ? Number.isFinite(v) : typeof v === "string" && /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(v) && Number.isFinite(Number(v));
  const types = columns.map((_, i) => rows.some(r => r[i] !== null) && rows.every(r => r[i] === null || numeric(r[i])) ? "DOUBLE PRECISION" as const : "TEXT" as const);
  rows = rows.map(r => r.map((v, i) => v === null ? null : types[i] === "TEXT" ? String(v) : Number(v)));
  return { columns, rows, types };
}

export type QueryResult = { columns: string[]; rows: unknown[][]; count: number; truncated: boolean };
export type TableInfo = { name: string; columns: string[]; catalog?: string; schema?: string };
