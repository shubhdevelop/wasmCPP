import { PGlite } from "@electric-sql/pglite";
import wasmUrl from "../../node_modules/@electric-sql/pglite/dist/pglite.wasm?url";
import initUrl from "../../node_modules/@electric-sql/pglite/dist/initdb.wasm?url";
import dataUrl from "../../node_modules/@electric-sql/pglite/dist/pglite.data?url";
import { cachedAsset } from "./cache";
import { MAX_RESULT_ROWS, quoteIdentifier as q } from "./data";
import type { TableInfo } from "./data";
import type { SqlAdapter } from "./adapter";

export async function createAdapter(): Promise<SqlAdapter> {
  const [wasm, init, data] = await Promise.all([cachedAsset(wasmUrl), cachedAsset(initUrl), cachedAsset(dataUrl)]);
  const options = {
    pgliteWasmModule: await WebAssembly.compile(await wasm.arrayBuffer()),
    initdbWasmModule: await WebAssembly.compile(await init.arrayBuffer()),
    fsBundle: await data.blob(),
  };
  let db = new PGlite(options);
  await db.waitReady;
  return {
    async execute(sql) {
      return (await db.exec(sql, {rowMode: "array"})).map(result => ({
        columns: result.fields.map(f => f.name), rows: (result.rows as unknown[][]).slice(0, MAX_RESULT_ROWS),
        count: result.fields.length ? result.rows.length : result.affectedRows ?? 0,
        truncated: result.rows.length > MAX_RESULT_ROWS,
      }));
    },
    async importData(name, data) {
      await db.transaction(async tx => {
        await tx.exec(`CREATE TABLE ${q(name)} (${data.columns.map((c,i) => `${q(c)} ${data.types[i]}`).join(",")})`);
        for (let start = 0; start < data.rows.length; start += 100) {
          const batch = data.rows.slice(start, start + 100);
          let index = 0;
          await tx.query(`INSERT INTO ${q(name)} VALUES ${batch.map(row => `(${row.map(() => `$${++index}`).join(",")})`).join(",")}`, batch.flat());
        }
      });
    },
    async importArchive(file) {
      const restored = new PGlite({...options,loadDataDir:file});
      try { await restored.waitReady; }
      catch (error) { void restored.close().catch(() => {}); throw new Error(`Could not restore PGlite snapshot: ${error instanceof Error ? error.message : String(error)}. Use an archive created by a compatible PGlite dumpDataDir version.`); }
      const previous = db; db = restored; await previous.close();
    },
    async tables() {
      const result = await db.query<{table_schema: string; table_name: string; column_name: string}>("SELECT table_schema,table_name,column_name FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema,table_name,ordinal_position");
      const tables = new Map<string, TableInfo>();
      for (const r of result.rows) {
        const key = JSON.stringify([r.table_schema,r.table_name]);
        const table = tables.get(key) ?? {name:r.table_name,schema:r.table_schema,columns:[]};
        table.columns.push(r.column_name); tables.set(key,table);
      }
      return [...tables.values()];
    },
    dispose() { void db.close(); },
  };
}
