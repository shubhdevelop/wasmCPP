import type { Engine, TableInfo } from "./data";
import { quoteIdentifier } from "./data";
export type ImportResult = { kind: "table" | "database" | "script"; name: string; rows?: number; message?: string };
export const acceptedFormats: Record<Engine,string> = {
  sqlite: ".csv,.tsv,.json,.jsonl,.ndjson,.db,.sqlite,.sqlite3,.sql",
  duckdb: ".csv,.tsv,.json,.jsonl,.ndjson,.parquet,.pq,.arrow,.feather,.ipc,.duckdb,.db,.sql",
  pglite: ".csv,.tsv,.json,.jsonl,.ndjson,.sql,.tar,.tar.gz,.tgz",
};
export function databaseFormat(bytes: Uint8Array): "sqlite" | "duckdb" | undefined {
  const decoder = new TextDecoder();
  if (decoder.decode(bytes.subarray(0,16)) === "SQLite format 3\0") return "sqlite";
  if (decoder.decode(bytes.subarray(8,12)) === "DUCK") return "duckdb";
}
export const isDatabaseFile = (name: string) => /\.(duckdb|db|sqlite|sqlite3)$/i.test(name);
export const qualifiedTable = (table: TableInfo) => [table.catalog,table.schema,table.name].filter((part): part is string => !!part).map(quoteIdentifier).join(".");
export const tableLabel = (table: TableInfo) => [table.catalog,table.schema,table.name].filter(Boolean).join(".");
