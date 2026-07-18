import type {
  D1BindableValue,
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike
} from "../../src/d1/index.js";

export interface D1Call {
  sql: string;
  values: readonly D1BindableValue[];
}

export class RecordingD1 implements D1DatabaseLike {
  readonly calls: D1Call[] = [];
  readonly responses: Array<D1ResultLike> = [];
  batchError: Error | null = null;

  prepare(sql: string): D1PreparedStatementLike {
    return new RecordingStatement(this, sql);
  }

  async batch<Row>(statements: D1PreparedStatementLike[]): Promise<D1ResultLike<Row>[]> {
    if (this.batchError) throw this.batchError;
    return statements.map((statement) => {
      const recorded = statement as RecordingStatement;
      this.calls.push({ sql: recorded.sql, values: recorded.values });
      return (this.responses.shift() ?? { success: true, results: [] }) as D1ResultLike<Row>;
    });
  }

  queue(rows: Record<string, unknown>[]): void {
    this.responses.push({ success: true, results: rows });
  }

  next<Row>(): D1ResultLike<Row> {
    return (this.responses.shift() ?? { success: true, results: [] }) as D1ResultLike<Row>;
  }
}

class RecordingStatement implements D1PreparedStatementLike {
  values: D1BindableValue[] = [];

  constructor(readonly database: RecordingD1, readonly sql: string) {}

  bind(...values: D1BindableValue[]): D1PreparedStatementLike {
    this.values = values;
    return this;
  }

  async first<Row>(): Promise<Row | null> {
    const result = this.record<Row>();
    return result.results?.[0] ?? null;
  }

  async all<Row>(): Promise<D1ResultLike<Row>> {
    return this.record<Row>();
  }

  async run<Row>(): Promise<D1ResultLike<Row>> {
    return this.record<Row>();
  }

  private record<Row>(): D1ResultLike<Row> {
    this.database.calls.push({ sql: this.sql, values: this.values });
    return this.database.next<Row>();
  }
}
