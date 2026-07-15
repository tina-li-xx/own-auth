import type { DatabaseRow } from "../database-types.js";

export type D1BindableValue = string | number | null | ArrayBuffer;

export interface D1ResultLike<Row = DatabaseRow> {
  results?: Row[];
  success?: boolean;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface D1PreparedStatementLike {
  bind(...values: D1BindableValue[]): D1PreparedStatementLike;
  first<Row = DatabaseRow>(columnName?: string): Promise<Row | null>;
  all<Row = DatabaseRow>(): Promise<D1ResultLike<Row>>;
  run<Row = DatabaseRow>(): Promise<D1ResultLike<Row>>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  batch<Row = DatabaseRow>(
    statements: D1PreparedStatementLike[]
  ): Promise<D1ResultLike<Row>[]>;
}
