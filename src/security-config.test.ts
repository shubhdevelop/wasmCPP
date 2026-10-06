import { describe, expect, it } from "vitest";
import vercelConfig from "../vercel.json";

describe("production Content Security Policy", () => {
  it("permits WebAssembly without enabling JavaScript eval", () => {
    const catchAll = vercelConfig.headers.find((rule) => rule.source === "/(.*)");
    const policy = catchAll?.headers.find((header) => header.key === "Content-Security-Policy")?.value;

    expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(policy).not.toMatch(/(?:^|\s)'unsafe-eval'(?:;|\s|$)/);
  });
});
