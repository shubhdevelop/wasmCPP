import type { SqlAdapter } from "./adapter";
import { MAX_FILE_BYTES, parseDataset } from "./data";
import { databaseFormat, isDatabaseFile } from "./formats";
let adapter: SqlAdapter | undefined;
let queue = Promise.resolve();
self.onmessage = event => {
  const message = event.data;
  queue = queue.then(async () => {
    try {
      let result: unknown;
      if (message.type === "init") {
        const module = message.engine === "sqlite" ? await import("./sqlite") : await import("./pglite");
        adapter = await module.createAdapter();
      } else {
        if (!adapter) throw new Error("Load the engine first.");
        if (message.type === "execute") result = await adapter.execute(message.sql);
        else if (message.type === "tables") result = await adapter.tables();
        else if (message.type === "import") {
          if (message.file.size > MAX_FILE_BYTES) throw new Error("Dataset exceeds 20 MB.");
          if (/\.(tar|tar\.gz|tgz)$/i.test(message.file.name)) {
            if (!adapter.importArchive) throw new Error("PGlite snapshots are supported only in the PGlite Lab.");
            await adapter.importArchive(message.file);
            result = {kind: "database", name: message.file.name, message: "PGlite snapshot restored; previous in-memory database replaced"};
          } else if (/\.sql$/i.test(message.file.name)) {
            await adapter.execute(await message.file.text());
            result = {kind: "script", name: message.file.name, message: "SQL script executed"};
          } else if (isDatabaseFile(message.file.name)) {
            const bytes = new Uint8Array(await message.file.arrayBuffer());
            const format = databaseFormat(bytes);
            if (format !== "sqlite") throw new Error(format === "duckdb" ? "Open this DuckDB database in the DuckDB Lab." : "This file is not a recognized SQLite database. Use a standalone database snapshot, not a WAL file.");
            if (!adapter.importDatabase) throw new Error("Native SQLite files are supported in the SQLite Lab. For PGlite, import a PostgreSQL plain SQL dump.");
            await adapter.importDatabase(message.name, bytes);
            result = {kind: "database", name: message.name, message: "SQLite database attached as a writable sandbox copy"};
          } else {
            const data = parseDataset(message.file.name, await message.file.text());
            await adapter.importData(message.name, data);
            result = {kind: "table", name: message.name, rows: data.rows.length};
          }
        }
      }
      self.postMessage({ id: message.id, result });
    } catch (error) { self.postMessage({ id: message.id, error: error instanceof Error ? error.message : String(error) }); }
  });
};
