import type { PostgresQueryable } from "../../src/postgres/index.js";

export interface QueryCall {
  sql: string;
  params: readonly unknown[];
}

export class RecordingDb implements PostgresQueryable {
  readonly calls: QueryCall[] = [];
  private readonly queuedRows: Record<string, unknown>[][] = [];

  queueRows(rows: Record<string, unknown>[]): void {
    this.queuedRows.push(rows);
  }

  async query<Row = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = []
  ): Promise<{ rows: Row[] }> {
    this.calls.push({ sql, params });
    return {
      rows: (this.queuedRows.shift() ?? []) as Row[]
    };
  }

  get lastCall(): QueryCall {
    const call = this.calls.at(-1);
    if (!call) throw new Error("No query call was recorded");
    return call;
  }
}
