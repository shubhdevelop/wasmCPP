import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompilerRuntime } from "./runtime-client";
import type { WorkerRequest, WorkerResponse } from "./types";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  lastRequest?: WorkerRequest;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: WorkerRequest) {
    this.lastRequest = message;
  }

  terminate() {}

  emit(message: WorkerResponse) {
    this.onmessage?.({ data: message } as MessageEvent<WorkerResponse>);
  }
}

const job = {
  entryFile: "main.cpp",
  files: [{ path: "main.cpp", content: "int main() {}" }],
  stdin: "",
  args: [],
  standard: "c++20" as const,
  optimization: "0" as const,
};

describe("CompilerRuntime timeouts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("Worker", FakeWorker);
    FakeWorker.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts the execution deadline only after the worker begins running", async () => {
    const runtime = new CompilerRuntime({ preparationMs: 1_000, executionMs: 50 });
    const result = runtime.run(job, () => {});
    const worker = FakeWorker.instances[0];

    await vi.advanceTimersByTimeAsync(900);
    worker.emit({ type: "status", id: 1, phase: "running" });
    await vi.advanceTimersByTimeAsync(49);

    worker.emit({
      type: "result",
      id: 1,
      stdout: "ok",
      stderr: "",
      compileOutput: "",
      compileMs: 900,
      runMs: 49,
      exitCode: 0,
      files: job.files,
    });

    await expect(result).resolves.toMatchObject({ type: "result", stdout: "ok" });
    runtime.dispose();
  });

  it("terminates execution independently of preparation time", async () => {
    const runtime = new CompilerRuntime({ preparationMs: 10_000, executionMs: 1_000 });
    const result = runtime.run(job, () => {});
    const rejection = expect(result).rejects.toThrow("Program execution stopped after 1 seconds");

    FakeWorker.instances[0].emit({ type: "status", id: 1, phase: "running" });
    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
    runtime.dispose();
  });
});
