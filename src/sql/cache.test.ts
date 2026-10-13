import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedAsset } from "./cache";
afterEach(() => vi.unstubAllGlobals());
describe("on-demand engine asset cache", () => {
  it("downloads once and reuses the content-hashed asset", async () => {
    const responses = new Map<string, Response>();
    const put = vi.fn(async (url: string, response: Response) => { responses.set(url, response); });
    vi.stubGlobal("caches", {open: async () => ({match: async (url: string) => responses.get(url)?.clone(), put})});
    const fetch = vi.fn(async () => new Response("wasm")); vi.stubGlobal("fetch", fetch);
    expect(await (await cachedAsset("/assets/engine-v1.wasm")).text()).toBe("wasm");
    expect(await (await cachedAsset("/assets/engine-v1.wasm")).text()).toBe("wasm");
    expect(fetch).toHaveBeenCalledTimes(1);
    await cachedAsset("/assets/engine-v2.wasm");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("loads when persistent storage is denied", async () => {
    vi.stubGlobal("caches", {open: async () => { throw new Error("denied"); }});
    vi.stubGlobal("fetch", async () => new Response("wasm"));
    expect(await (await cachedAsset("/assets/engine.wasm")).text()).toBe("wasm");
  });
  it("does not cache failed downloads", async () => {
    const put = vi.fn();
    vi.stubGlobal("caches", {open: async () => ({match: async () => undefined, put})});
    vi.stubGlobal("fetch", async () => new Response("error", {status: 503}));
    await expect(cachedAsset("/assets/engine.wasm")).rejects.toThrow("503");
    expect(put).not.toHaveBeenCalled();
  });
});
