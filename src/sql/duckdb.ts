import * as duckdb from "@duckdb/duckdb-wasm";
import mvpUrl from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import ehUrl from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import mvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import ehWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import { cachedAsset } from "./cache";
import { MAX_FILE_BYTES, MAX_RESULT_ROWS, parseDataset, quoteIdentifier as q } from "./data";
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
    async importFile(name: string, file: File) {
      if (file.size > MAX_FILE_BYTES) throw new Error("Dataset exceeds 20 MB.");
      if (/\.parquet$/i.test(file.name)) {
        const path = `import-${crypto.randomUUID()}.parquet`;
        await db.registerFileBuffer(path, new Uint8Array(await file.arrayBuffer()));
        try {
          await connection.query(`CREATE TABLE ${q(name)} AS SELECT * FROM read_parquet('${path}')`);
          const count = await connection.query(`SELECT count(*) AS n FROM ${q(name)}`);
          return Number(count.get(0)?.n);
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
      return data.rows.length;
    },
    async tables(): Promise<TableInfo[]> {
      const result = await connection.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='main' ORDER BY table_name,ordinal_position");
      const tables = new Map<string, string[]>();
      for (const r of result.toArray()) { const columns = tables.get(r.table_name) ?? []; columns.push(r.column_name); tables.set(r.table_name, columns); }
      return [...tables].map(([name, columns]) => ({name, columns}));
    },
    dispose() { worker.terminate(); },
  };
}
