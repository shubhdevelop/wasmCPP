import { describe, it, expect } from "vitest";
import { parseCSV, parseDataset, quoteIdentifier, tableName } from "./data";

describe("dataset import", () => {
  it("handles BOM, CRLF, escaped quotes, commas and multiline values", () => {
    expect(parseCSV('\uFEFFname,note\r\nAda,"hello, ""SQL""\nworld"\r\n')).toEqual([["name", "note"], ["Ada", 'hello, "SQL"\nworld']]);
  });
  it("infers numeric columns and keeps mixed columns as text", () => {
    expect(parseDataset("test.csv", "n,mixed,empty\n1,1,\n2,hello,\n")).toEqual({columns:["n","mixed","empty"],types:["DOUBLE PRECISION","TEXT","TEXT"],rows:[[1,"1",null],[2,"hello",null]]});
  });
  it("unifies JSON keys and preserves nested data", () => {
    expect(parseDataset("test.json", '[{"id":1,"x":{"ok":true}},{"id":2,"other":"yes"}]').rows).toEqual([[1,'{"ok":true}',null],[2,null,"yes"]]);
  });
  it("rejects invalid rows, quotes, duplicate columns and JSON shapes", () => {
    for (const text of ['a,b\n1', 'a\n"open', 'a,A\n1,2', 'a\n"a"oops']) expect(() => parseDataset("x.csv", text)).toThrow();
    expect(() => parseDataset("x.json", '[1,2]')).toThrow();
  });
  it("quotes SQL identifiers without treating them as commands", () => {
    expect(quoteIdentifier('a"; DROP TABLE t;--')).toBe('"a""; DROP TABLE t;--"');
    expect(tableName("2026 sales.csv")).toBe("_2026_sales");
  });
});
