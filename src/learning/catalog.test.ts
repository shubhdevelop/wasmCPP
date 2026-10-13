import { describe, expect, it } from "vitest";
import { findExercise, labHref, tracks, validateCatalog } from "./catalog";
describe("learning curriculum", () => {
  it("has the ten requested tracks with lessons and exercises", () => {
    expect(tracks.map(t=>t.id)).toEqual(["cpp","dbms","networking","os","sqlite","duckdb","pglite","lld","hld","design-patterns"]);
    expect(()=>validateCatalog(tracks)).not.toThrow();
    for (const track of tracks) for (const module of track.modules) {
      expect(module.lessons.length).toBeGreaterThan(0);
      expect(module.exercises.length).toBeGreaterThan(0);
    }
  });
  it("links runnable exercises to matching labs and keeps theory in the reader", () => {
    expect(labHref(findExercise("cpp-binary-search")!)).toBe("/?exercise=cpp-binary-search");
    expect(labHref(findExercise("sqlite-category-totals")!)).toBe("/labs/sqlite?exercise=sqlite-category-totals");
    for (const id of ["lld-parking-lot", "patterns-shipping-strategy", "patterns-temperature-adapter", "patterns-inventory-observer"]) {
      const context = findExercise(id)!;
      expect(labHref(context)).toBe(`/?exercise=${id}`);
      expect(context.exercise.starter).toContain("TODO");
      expect(context.exercise.expected).toBeTruthy();
      expect(context.exercise.answer).toContain("```cpp");
    }
    expect(labHref(findExercise("hld-url-shortener")!)).toBe("/learn/hld/hld-foundations?exercise=hld-url-shortener");
    expect(findExercise("unknown")).toBeUndefined();
  });
  it("rejects duplicate exercise IDs and executable resource URLs", () => {
    const duplicate = structuredClone(tracks);
    duplicate[1].modules[0].exercises[0].id = duplicate[0].modules[0].exercises[0].id;
    expect(()=>validateCatalog(duplicate)).toThrow("duplicate");
    const unsafe = structuredClone(tracks);
    unsafe[0].modules[0].resources[0].url = "javascript:alert(1)";
    expect(()=>validateCatalog(unsafe)).toThrow("HTTP");
  });
});
