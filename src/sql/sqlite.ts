import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import wasmUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url";
import { cachedAsset } from "./cache";
import { MAX_RESULT_ROWS, quoteIdentifier as q } from "./data";
import type { QueryResult, TableInfo } from "./data";
import type { SqlAdapter } from "./adapter";

export async function createAdapter(): Promise<SqlAdapter> {
  const url = URL.createObjectURL(await (await cachedAsset(wasmUrl)).blob());
  let sqlite;
  try { sqlite = await (sqlite3InitModule as unknown as (config: {locateFile: () => string}) => ReturnType<typeof sqlite3InitModule>)({ locateFile: () => url }); }
  finally { URL.revokeObjectURL(url); }
  const db = new sqlite.oo1.DB(":memory:", "c");
  const execute = async (sql: string) => {
    const result: QueryResult = {columns: [], rows: [], count: 0, truncated: false};
    const before = db.changes(true);
    db.exec({ sql, columnNames: result.columns, rowMode: "array", callback(row) {
      result.count++;
      if (result.rows.length < MAX_RESULT_ROWS) result.rows.push(row);
      else result.truncated = true;
    } });
    if (!result.columns.length) result.count = db.changes(true) - before;
    return [result];
  };
  return {
    execute,
    async importData(name, data) {
      db.exec("BEGIN");
      try {
        db.exec(`CREATE TABLE ${q(name)} (${data.columns.map((c,i) => `${q(c)} ${data.types[i]}`).join(",")})`);
        const stmt = db.prepare(`INSERT INTO ${q(name)} VALUES (${data.columns.map(() => "?").join(",")})`);
        try { for (const row of data.rows) { stmt.bind(row); stmt.step(); stmt.reset(true); } }
        finally { stmt.finalize(); }
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    async importDatabase(name, bytes) {
      const databases = await execute("PRAGMA database_list");
      if (databases[0].rows.some(row => String(row[1]).toLowerCase() === name.toLowerCase())) throw new Error("A database with this name is already attached. Choose another database alias.");
      db.exec(`ATTACH ':memory:' AS ${q(name)}`);
      if (bytes[18] === 2 || bytes[19] === 2) { db.exec(`DETACH ${q(name)}`); throw new Error("This SQLite file uses WAL mode. Export a standalone SQLite backup before importing; WAL sidecar files are not included."); }
      let pointer = sqlite.capi.sqlite3_malloc(bytes.byteLength + 20);
      if (!pointer) { db.exec(`DETACH ${q(name)}`); throw new Error("Not enough memory to import this database."); }
      sqlite.wasm.heap8u().set(bytes,pointer);
      sqlite.wasm.heap8u().fill(0,pointer + bytes.byteLength,pointer + bytes.byteLength + 20);
      try {
        const rc = sqlite.capi.sqlite3_deserialize(db.pointer!, name, pointer, bytes.byteLength, bytes.byteLength + 20, sqlite.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite.capi.SQLITE_DESERIALIZE_RESIZEABLE);
        pointer = 0; // FREEONCLOSE transfers ownership even when deserialize returns an error.
        if (rc) throw new Error(`SQLite import failed (code ${rc}).`);
        db.exec(`SELECT count(*) FROM ${q(name)}.sqlite_schema`);
      } catch (error) {
        db.exec(`DETACH ${q(name)}`);
        throw error;
      } finally { if (pointer) sqlite.capi.sqlite3_free(pointer); }
    },
    async tables() {
      const databases = await execute("PRAGMA database_list");
      const tables: TableInfo[] = [];
      for (const database of databases[0].rows) {
        const schema = String(database[1]);
        const names = await execute(`SELECT name FROM ${q(schema)}.sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name`);
        for (const row of names[0].rows) {
          const name = String(row[0]), columns: string[] = [];
          db.exec({sql: `PRAGMA ${q(schema)}.table_info(${q(name)})`, rowMode: "object", callback: row => { columns.push(String(row.name)); }});
          tables.push({name, schema, columns});
        }
      }
      return tables;
    },
    dispose() { db.close(); },
  };
}
