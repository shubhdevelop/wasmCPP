import type { WorkerRequest, WorkerResponse } from "./types";

type RuntimeJob = Omit<WorkerRequest, "type" | "id">;
type RuntimeResult = Exclude<WorkerResponse, { type: "status" }>;
type StatusCallback = (phase: Extract<WorkerResponse, { type: "status" }>["phase"]) => void;
type RuntimeStage = "preparation" | "execution";

export type RuntimeTimeouts = {
  preparationMs: number;
  executionMs: number;
};

export const DEFAULT_RUNTIME_TIMEOUTS: RuntimeTimeouts = {
  preparationMs: 5 * 60_000,
  executionMs: 30_000,
};

export class RuntimeStoppedError extends Error {
  constructor(message = "Execution stopped.") {
    super(message);
    this.name = "RuntimeStoppedError";
  }
}

export class CompilerRuntime {
  private worker: Worker;
  private runId = 0;
  private readonly timeouts: RuntimeTimeouts;
  private pending?: {
    id: number;
    timer: number;
    stage: RuntimeStage;
    resolve: (result: RuntimeResult) => void;
    reject: (error: Error) => void;
    onStatus: StatusCallback;
  };

  constructor(timeouts: Partial<RuntimeTimeouts> = {}) {
    this.timeouts = { ...DEFAULT_RUNTIME_TIMEOUTS, ...timeouts };
    this.worker = this.createWorker();
  }

  run(job: RuntimeJob, onStatus: StatusCallback) {
    if (this.pending) return Promise.reject(new Error("A compiler job is already running."));
    const id = ++this.runId;
    return new Promise<RuntimeResult>((resolve, reject) => {
      const pending = { id, timer: 0, stage: "preparation" as const, resolve, reject, onStatus };
      this.pending = pending;
      this.armTimeout(pending, "preparation");
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
      if (message.phase === "running" && pending.stage !== "execution") {
        this.armTimeout(pending, "execution");
      }
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

  private armTimeout(pending: NonNullable<CompilerRuntime["pending"]>, stage: RuntimeStage) {
    window.clearTimeout(pending.timer);
    pending.stage = stage;
    const timeoutMs = stage === "preparation" ? this.timeouts.preparationMs : this.timeouts.executionMs;
    pending.timer = window.setTimeout(() => {
      if (this.pending !== pending) return;
      this.pending = undefined;
      this.restartWorker();
      const seconds = Math.round(timeoutMs / 1000);
      pending.reject(new Error(stage === "preparation"
        ? `Compiler preparation stopped after ${seconds} seconds. Check the network connection and try again.`
        : `Program execution stopped after ${seconds} seconds. Check for an infinite loop or reduce the workload.`));
    }, timeoutMs);
  }
}
