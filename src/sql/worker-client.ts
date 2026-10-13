import type { ImportResult } from "./formats";
import type { Engine, QueryResult, TableInfo } from "./data";
export class SqlWorkerClient {
  private worker = new Worker(new URL("./engine.worker.ts", import.meta.url), {type: "module"});
  private id = 0;
  private disposed = false;
  private pending = new Map<number, {resolve: (value: unknown) => void; reject: (error: Error) => void}>();
  constructor() {
    this.worker.onmessage = ({data}) => {
      const job = this.pending.get(data.id);
      if (!job) return;
      this.pending.delete(data.id);
      if (data.error) job.reject(new Error(data.error)); else job.resolve(data.result);
    };
    this.worker.onerror = event => this.dispose(Object.assign(new Error(event.message || "Database worker failed."), {name: "SqlWorkerError"}));
  }
  private request<T>(message: object): Promise<T> {
    if (this.disposed) return Promise.reject(Object.assign(new Error("Database worker stopped. Reload the engine."), {name: "SqlWorkerError"}));
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, {resolve: value => resolve(value as T), reject});
      this.worker.postMessage({...message, id});
    });
  }
  init(engine: Engine) { return this.request<void>({type: "init", engine}); }
  execute(sql: string) { return this.request<QueryResult[]>({type: "execute", sql}); }
  tables() { return this.request<TableInfo[]>({type: "tables"}); }
  importFile(name: string, file: File) { return this.request<ImportResult>({type: "import", name, file}); }
  dispose(error = new Error("Sandbox stopped. Its in-memory database was cleared.")) {
    this.disposed = true;
    this.worker.terminate();
    for (const job of this.pending.values()) job.reject(error);
    this.pending.clear();
  }
}
