import type { Dataset, QueryResult, TableInfo } from "./data";
export interface SqlAdapter {
  execute(sql: string): Promise<QueryResult[]>;
  importData(name: string, data: Dataset): Promise<void>;
  tables(): Promise<TableInfo[]>;
  dispose(): void;
}
