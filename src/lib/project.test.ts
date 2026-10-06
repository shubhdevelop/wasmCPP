import { describe, expect, it } from "vitest";
import { findEntryFile, normalizeProjectPath, validateProjectFiles } from "./project";

describe("normalizeProjectPath", () => {
  it("normalizes leading and duplicate slashes", () => {
    expect(normalizeProjectPath(" /include//math.hpp ")).toEqual({ ok: true, path: "include/math.hpp" });
  });

  it.each(["../secret", "src/../secret", "folder/", "a b.cpp", "./main.cpp"])("rejects unsafe path %s", (path) => {
    expect(normalizeProjectPath(path).ok).toBe(false);
  });
});

describe("project validation", () => {
  it("accepts a normal text project and reports its size", () => {
    expect(validateProjectFiles([{ path: "main.cpp", content: "int main() {}" }])).toEqual({ ok: true, totalBytes: 13 });
  });

  it("rejects duplicate paths", () => {
    expect(validateProjectFiles([
      { path: "main.cpp", content: "a" },
      { path: "main.cpp", content: "b" },
    ])).toMatchObject({ ok: false });
  });

  it("prefers main.cpp as the entry file", () => {
    const files = [
      { path: "demo.cpp", content: "" },
      { path: "main.cpp", content: "" },
    ];
    expect(findEntryFile(files)?.path).toBe("main.cpp");
  });
});
