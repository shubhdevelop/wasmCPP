import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SqlRuntime } from "./runtime";
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: {data: object}) => void) | null = null;
  onerror: ((event: {message: string}) => void) | null = null;
  last?: {id: number; type: string};
  terminate = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
  postMessage(message: {id: number; type: string}) { this.last = message; }
  respond(result?: unknown) { this.onmessage?.({data: {id: this.last!.id, result}}); }
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("window", globalThis); vi.stubGlobal("Worker", FakeWorker); FakeWorker.instances = []; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("SQL runtime lifecycle", () => {
  it("creates no worker until demand, shares loading and reuses the loaded engine", async () => {
    const runtime = new SqlRuntime("sqlite");
    expect(FakeWorker.instances).toHaveLength(0);
    const first = runtime.load();
    expect(runtime.ready).toBe(false);
    expect(runtime.load()).toBe(first);
    FakeWorker.instances[0].respond();
    const client = await first;
    expect(runtime.ready).toBe(true);
    expect(await runtime.load()).toBe(client);
    expect(FakeWorker.instances).toHaveLength(1);
    runtime.reset();
    expect(runtime.ready).toBe(false);
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
  });
  it("terminates a hung query after the execution deadline and permits a fresh engine", async () => {
    const runtime = new SqlRuntime("sqlite");
    const load = runtime.load(); FakeWorker.instances[0].respond(); await load;
    const result = runtime.perform(client => client.execute("SELECT 1"), () => {});
    const failure = expect(result).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(30_000);
    await failure;
    expect(runtime.ready).toBe(false);
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
    const next = runtime.load(); FakeWorker.instances[1].respond(); await next;
    expect(runtime.ready).toBe(true);
    runtime.reset();
  });
  it("cancels engine preparation immediately on stop", async () => {
    const runtime = new SqlRuntime("pglite");
    const result = runtime.perform(async () => {}, () => {});
    const failure = expect(result).rejects.toThrow("stopped");
    runtime.reset(); await failure;
    expect(runtime.ready).toBe(false);
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
  });
});

describe("worker crash recovery", () => {
  it("clears a failed worker and reloads on the next operation", async () => {
    const runtime = new SqlRuntime("sqlite");
    const load = runtime.load(); FakeWorker.instances[0].respond(); await load;
    const result = runtime.perform(client => client.execute("SELECT 1"), () => {});
    const failure = expect(result).rejects.toThrow("crash");
    await vi.advanceTimersByTimeAsync(0);
    FakeWorker.instances[0].onerror?.({message:"crash"});
    await failure;
    expect(runtime.ready).toBe(false);
    const next = runtime.load(); FakeWorker.instances[1].respond(); await next;
    expect(runtime.ready).toBe(true);
    runtime.reset();
  });
});
