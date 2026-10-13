import { describe, expect, it } from "vitest";
import { acceptedFormats, databaseFormat, qualifiedTable } from "./formats";
import { parseDataset } from "./data";
describe("database file routing", () => {
  it("uses the file header rather than the ambiguous .db extension", () => {
    expect(databaseFormat(new TextEncoder().encode("SQLite format 3\0more"))).toBe("sqlite");
    expect(databaseFormat(new TextEncoder().encode("12345678DUCKmore"))).toBe("duckdb");
    expect(databaseFormat(new TextEncoder().encode("not a database"))).toBeUndefined();
  });
  it("quotes catalog, schema, and table identifiers separately", () => {
    expect(qualifiedTable({catalog:"my.db",schema:"custom",name:'a"b',columns:[]})).toBe('"my.db"."custom"."a""b"');
    expect(qualifiedTable({schema:"main",name:"people",columns:[]})).toBe('"main"."people"');
  });
  it("offers native formats only in the engine that can read them", () => {
    expect(acceptedFormats.duckdb).toContain(".duckdb");
    expect(acceptedFormats.sqlite).toContain(".sqlite3");
    expect(acceptedFormats.pglite).toContain(".tar.gz");
    expect(acceptedFormats.pglite).not.toContain(".duckdb");
  });
  it("parses TSV and newline-delimited JSON", () => {
    expect(parseDataset("people.tsv", "id\tname\n1\tAda\n2\tGrace\n").rows).toEqual([[1,"Ada"],[2,"Grace"]]);
    expect(parseDataset("people.jsonl", '{"id":1,"name":"Ada"}\n{"id":2,"name":"Grace"}\n').rows).toEqual([[1,"Ada"],[2,"Grace"]]);
  });
});
