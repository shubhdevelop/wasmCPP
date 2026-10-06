import type { WorkerRequest, WorkerResponse } from "./types";

type RuntimeJob = Omit<WorkerRequest, "type" | "id">;
type RuntimeResult = Exclude<WorkerResponse, { type: "status" }>;
type StatusCallback = (phase: Extract<WorkerResponse, { type: "status" }>["phase"]) => void;

export class RuntimeStoppedError extends Error {
  constructor(message = "Execution stopped.") {
    super(message);
    this.name = "RuntimeStoppedError";
  }
}

export class CompilerRuntime {
  private worker: Worker;
  private runId = 0;
  private pending?: {
    id: number;
    timer: number;
    resolve: (result: RuntimeResult) => void;
    reject: (error: Error) => void;
    onStatus: StatusCallback;
  };

  constructor(private readonly timeoutMs = 30_000) {
    this.worker = this.createWorker();
  }

  run(job: RuntimeJob, onStatus: StatusCallback) {
    if (this.pending) return Promise.reject(new Error("A compiler job is already running."));
    const id = ++this.runId;
    return new Promise<RuntimeResult>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.restartWorker();
        this.pending = undefined;
        reject(new Error(`Execution stopped after ${Math.round(this.timeoutMs / 1000)} seconds. Check for an infinite loop or reduce the workload.`));
      }, this.timeoutMs);
      this.pending = { id, timer, resolve, reject, onStatus };
      this.worker.postMessage({ type: "run", id, ...job } satisfies WorkerRequest);
    });
  }

  stop() {
    if (!this.pending) return;
    const pending = this.pending;
    this.pending = undefined;
    window.clearTimeout(pending.timer);
    this.restartWorker();
    pending.reject(new RuntimeStoppedError());
  }

  dispose() {
    this.stop();
    this.worker.terminate();
  }

  private createWorker() {
    const worker = new Worker(new URL("./compiler.worker.ts", import.meta.url), { type: "module", name: "cpp-compiler" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.handleMessage(event.data);
    worker.onerror = (event) => {
      if (!this.pending) return;
      const pending = this.pending;
      this.pending = undefined;
      window.clearTimeout(pending.timer);
      pending.reject(new Error(`Compiler worker failed: ${event.message}`));
      this.restartWorker();
    };
    return worker;
  }

  private handleMessage(message: WorkerResponse) {
    const pending = this.pending;
    if (!pending || message.id !== pending.id) return;
    if (message.type === "status") {
      pending.onStatus(message.phase);
      return;
    }
    this.pending = undefined;
    window.clearTimeout(pending.timer);
    pending.resolve(message);
  }

  private restartWorker() {
    this.worker.terminate();
    this.worker = this.createWorker();
  }
}
