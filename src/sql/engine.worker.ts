import type { SqlAdapter } from "./adapter";
import { MAX_FILE_BYTES, parseDataset } from "./data";
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
          const data = parseDataset(message.file.name, await message.file.text());
          await adapter.importData(message.name, data);
          result = data.rows.length;
        }
      }
      self.postMessage({ id: message.id, result });
    } catch (error) { self.postMessage({ id: message.id, error: error instanceof Error ? error.message : String(error) }); }
  });
};
