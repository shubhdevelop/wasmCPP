import { describe, expect, it } from "vitest";
import { parseProgramArgs } from "./args";

describe("parseProgramArgs", () => {
  it("parses plain, quoted, and escaped arguments", () => {
    expect(parseProgramArgs(`alpha "two words" 'three words' escaped\\"quote`)).toEqual([
      "alpha",
      "two words",
      "three words",
      'escaped"quote',
    ]);
  });

  it("returns an empty list for whitespace", () => {
    expect(parseProgramArgs("   \n\t")).toEqual([]);
  });
});
