import { describe, expect, it } from "vitest";
import vercelConfig from "../vercel.json";

describe("production Content Security Policy", () => {
  it("permits WebAssembly without enabling JavaScript eval", () => {
    const catchAll = vercelConfig.headers.find((rule) => rule.source === "/(.*)");
    const policy = catchAll?.headers.find((header) => header.key === "Content-Security-Policy")?.value;

    expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(policy).not.toMatch(/(?:^|\s)'unsafe-eval'(?:;|\s|$)/);
  });

  it("revalidates worker scripts while keeping other hashed assets immutable", () => {
    const assetRuleIndex = vercelConfig.headers.findIndex((rule) => rule.source === "/assets/(.*)");
    const workerRuleIndex = vercelConfig.headers.findIndex((rule) => rule.source === "/assets/compiler.worker-(.*).js");
    const workerCacheControl = vercelConfig.headers[workerRuleIndex]?.headers
      .find((header) => header.key === "Cache-Control")?.value;

    expect(assetRuleIndex).toBeGreaterThanOrEqual(0);
    expect(workerRuleIndex).toBeGreaterThan(assetRuleIndex);
    expect(workerCacheControl).toBe("public, max-age=0, must-revalidate");
  });
});
