import type { ImportResult } from "./formats";
import type { Engine, QueryResult, TableInfo } from "./data";
import { SqlWorkerClient } from "./worker-client";
interface Client {
  execute(sql: string): Promise<QueryResult[]>;
  importFile(name: string, file: File): Promise<ImportResult>;
  tables(): Promise<TableInfo[]>;
  dispose(): void;
}
export class SqlRuntime {
  private client?: Client;
  private loading?: Promise<Client>;
  private generation = 0;
  private cancel?: () => void;
  private initialized = false;
  private loadingDispose?: () => void;
  constructor(readonly engine: Engine) {}
  get ready() { return this.initialized; }
  load() {
    if (this.initialized && this.client) return Promise.resolve(this.client);
    if (this.loading) return this.loading;
    const generation = this.generation;
    this.loading = (async () => {
      let client: Client;
      if (this.engine === "duckdb") {
        const {createClient} = await import("./duckdb");
        client = await createClient(dispose => {
          if (this.generation !== generation) dispose();
          else this.loadingDispose = dispose;
        });
      } else {
        const worker = new SqlWorkerClient();
        this.client = worker;
        try { await worker.init(this.engine); } catch (error) { worker.dispose(); throw error; }
        client = worker;
      }
      if (this.generation !== generation) { client.dispose(); throw new Error("Engine loading was stopped."); }
      this.client = client;
      this.initialized = true;
      return client;
    })().catch(error => { if (this.generation === generation) this.client = undefined; throw error; })
      .finally(() => { if (this.generation === generation) { this.loading = undefined; this.loadingDispose = undefined; } });
    return this.loading;
  }
  async perform<T>(operation: (client: Client) => Promise<T>, onPhase: (phase: string) => void): Promise<T> {
    const wasReady = this.ready;
    onPhase(wasReady ? "Running…" : "Loading engine (first download can take a while)…");
    const withTimeout = <V>(promise: Promise<V>, ms: number) => new Promise<V>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error("Operation timed out. The sandbox was cleared; try a smaller query or dataset."));
        this.reset();
      }, ms);
      const cancel = () => { window.clearTimeout(timer); reject(new Error("Sandbox stopped. Its in-memory database was cleared.")); };
      this.cancel = cancel;
      promise.then(resolve, reject).finally(() => {
        window.clearTimeout(timer);
        if (this.cancel === cancel) this.cancel = undefined;
      });
    });
    const client = await withTimeout(this.load(), 5 * 60_000);
    onPhase("Running…");
    try { return await withTimeout(operation(client), 30_000); }
    catch (error) {
      if (error instanceof Error && error.name === "SqlWorkerError") this.reset();
      throw error;
    }
  }
  reset() {
    this.cancel?.();
    this.cancel = undefined;
    this.initialized = false;
    this.generation++;
    this.loadingDispose?.();
    this.loadingDispose = undefined;
    this.client?.dispose();
    this.client = undefined;
    this.loading = undefined;
  }
}
