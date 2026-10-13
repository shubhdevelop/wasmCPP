import { tableFromIPC } from "apache-arrow";
import * as duckdb from "@duckdb/duckdb-wasm";
import mvpUrl from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import ehUrl from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import mvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import ehWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import { cachedAsset } from "./cache";
import { MAX_FILE_BYTES, MAX_RESULT_ROWS, parseDataset, quoteIdentifier as q } from "./data";
import { databaseFormat, isDatabaseFile } from "./formats";
import type { ImportResult } from "./formats";
import type { QueryResult, TableInfo } from "./data";

export async function createClient(onWorker: (dispose: () => void) => void = () => {}) {
  const bundle = await duckdb.selectBundle({mvp: {mainModule: mvpUrl, mainWorker: mvpWorker}, eh: {mainModule: ehUrl, mainWorker: ehWorker}});
  const worker = new Worker(bundle.mainWorker!);
  onWorker(() => worker.terminate());
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  let connection: duckdb.AsyncDuckDBConnection;
  const url = URL.createObjectURL(await (await cachedAsset(bundle.mainModule)).blob());
  try { await db.instantiate(url); connection = await db.connect(); }
  catch (error) { worker.terminate(); throw error; }
  finally { URL.revokeObjectURL(url); }
  return {
    async execute(sql: string): Promise<QueryResult[]> {
      const result = await connection.query(sql);
      return [{ columns: result.schema.fields.map(f => f.name), rows: Array.from({length: Math.min(result.numRows, MAX_RESULT_ROWS)}, (_, i) => result.schema.fields.map(f => result.get(i)?.[f.name])), count: result.numRows, truncated: result.numRows > MAX_RESULT_ROWS }];
    },
    async importFile(name: string, file: File): Promise<ImportResult> {
      if (file.size > MAX_FILE_BYTES) throw new Error("Dataset exceeds 20 MB.");
      if (/\.(arrow|feather|ipc)$/i.test(file.name)) {
        const table = tableFromIPC(new Uint8Array(await file.arrayBuffer()));
        await connection.query("BEGIN TRANSACTION");
        try {
          const existing = await connection.query(`SELECT count(*) AS n FROM information_schema.tables WHERE table_catalog = current_database() AND table_schema = 'main' AND table_name = '${name.replaceAll("'", "''")}'`);
          if (Number(existing.get(0)?.n)) throw new Error("A table with this name already exists. Choose another table name.");
          await connection.insertArrowTable(table, {name, create:true});
          await connection.query("COMMIT");
        } catch (error) { await connection.query("ROLLBACK"); throw error; }
        return {kind:"table",name,rows:table.numRows};
      }
      if (/\.sql$/i.test(file.name)) {
        await connection.query(await file.text());
        return {kind: "script", name: file.name, message: "SQL script executed"};
      }
      if (isDatabaseFile(file.name)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const format = databaseFormat(bytes);
        if (format !== "duckdb") throw new Error(format === "sqlite" ? "This is a SQLite database. Import it in the SQLite Lab, or export its tables to CSV/Parquet for DuckDB." : "This file is not a recognized DuckDB database. Use a checkpointed .duckdb or .db snapshot, not a WAL file.");
        const path = `import-${crypto.randomUUID()}.duckdb`;
        await db.registerFileBuffer(path, bytes);
        try { await connection.query(`ATTACH '${path}' AS ${q(name)} (READ_ONLY)`); }
        catch (error) {
          await db.dropFile(path);
          throw new Error(`Could not attach DuckDB database: ${error instanceof Error ? error.message : String(error)}. The file must be compatible with this DuckDB-WASM version.`);
        }
        // Keep the registered file alive for lazy reads until the worker is reset.
        return {kind: "database", name, message: "DuckDB database attached read-only; copy tables into memory to edit"};
      }
      if (/\.(parquet|pq)$/i.test(file.name)) {
        const path = `import-${crypto.randomUUID()}.parquet`;
        await db.registerFileBuffer(path, new Uint8Array(await file.arrayBuffer()));
        try {
          await connection.query(`CREATE TABLE ${q(name)} AS SELECT * FROM read_parquet('${path}')`);
          const count = await connection.query(`SELECT count(*) AS n FROM ${q(name)}`);
          return {kind: "table", name, rows: Number(count.get(0)?.n)};
        } finally { await db.dropFile(path); }
      }
      const data = parseDataset(file.name, await file.text());
      await connection.query("BEGIN TRANSACTION");
      try {
        await connection.query(`CREATE TABLE ${q(name)} (${data.columns.map((c,i) => `${q(c)} ${data.types[i]}`).join(",")})`);
        // Parameter binding preserves user data without SQL interpolation.
        for (let start = 0; start < data.rows.length; start += 100) {
          const batch = data.rows.slice(start, start + 100);
          const stmt = await connection.prepare(`INSERT INTO ${q(name)} VALUES ${batch.map(row => `(${row.map(() => "?").join(",")})`).join(",")}`);
          try { await stmt.query(...batch.flat()); } finally { await stmt.close(); }
        }
        await connection.query("COMMIT");
      } catch (error) { await connection.query("ROLLBACK"); throw error; }
      return {kind: "table", name, rows: data.rows.length};
    },
    async tables(): Promise<TableInfo[]> {
      const result = await connection.query("SELECT table_catalog,table_schema,table_name,column_name FROM information_schema.columns WHERE table_schema NOT IN ('information_schema','pg_catalog') ORDER BY table_catalog,table_schema,table_name,ordinal_position");
      const tables = new Map<string, TableInfo>();
      for (const r of result.toArray()) {
        const key = JSON.stringify([r.table_catalog,r.table_schema,r.table_name]);
        const table = tables.get(key) ?? {name: String(r.table_name), catalog: String(r.table_catalog), schema: String(r.table_schema), columns: []};
        table.columns.push(String(r.column_name)); tables.set(key,table);
      }
      return [...tables.values()];
    },
    dispose() { worker.terminate(); },
  };
}
