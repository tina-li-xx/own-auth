export interface PostgresQueryResult<Row> {
  rows: Row[];
}

export interface PostgresQueryable {
  query<Row = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[]
  ): Promise<PostgresQueryResult<Row>>;
}

export type ColumnMap<Entity> = Record<keyof Entity & string, string>;

export type Row = Record<string, unknown>;
