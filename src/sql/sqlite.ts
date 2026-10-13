import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import wasmUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url";
import { cachedAsset } from "./cache";
import { MAX_RESULT_ROWS, quoteIdentifier as q } from "./data";
import type { QueryResult } from "./data";
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
    async tables() {
      const names = await execute("SELECT name FROM sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name");
      return (names[0]?.rows ?? []).map(row => {
        const name = String(row[0]);
        const columns: string[] = [];
        db.exec({sql: `PRAGMA table_info(${q(name)})`, rowMode: "object", callback: row => { columns.push(String(row.name)); }});
        return { name, columns };
      });
    },
    dispose() { db.close(); },
  };
}
