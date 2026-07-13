import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import type { PostgresQueryable } from "../../src/postgres/postgres-types.js";

const { Pool } = pg;
const defaultDatabaseUrl = "postgres://localhost:5432/own_auth_test";
const explicitDatabaseUrl = process.env.OWN_AUTH_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const databaseUrl = explicitDatabaseUrl ?? defaultDatabaseUrl;
const requireDatabase = process.env.OWN_AUTH_REQUIRE_POSTGRES === "true";

export const hasPostgresTestDatabase = explicitDatabaseUrl || requireDatabase
  ? true
  : await canConnect(databaseUrl);

export interface PostgresTestDatabase {
  client: pg.PoolClient;
  queryable: PostgresQueryable;
  connectPair(): Promise<[pg.PoolClient, pg.PoolClient]>;
  close(): Promise<void>;
}

export async function createPostgresTestDatabase(): Promise<PostgresTestDatabase> {
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  const schema = `own_auth_test_${randomUUID().replace(/-/g, "")}`;

  try {
    await client.query(`create schema ${quoteIdentifier(schema)}`);
    await setSearchPath(client, schema);

    const migration = await readFile(
      new URL("../../migrations/001_initial.sql", import.meta.url),
      "utf8"
    );
    await client.query(migration);
  } catch (error) {
    client.release();
    await pool.end().catch(() => undefined);
    throw error;
  }

  const connect = async (): Promise<pg.PoolClient> => {
    const connection = await pool.connect();
    try {
      await setSearchPath(connection, schema);
      return connection;
    } catch (error) {
      connection.release();
      throw error;
    }
  };

  const queryable: PostgresQueryable = {
    async query<Row>(sql: string, params?: readonly unknown[]) {
      const connection = await connect();
      try {
        const result = await connection.query(sql, params ? [...params] : undefined);
        return { rows: result.rows as Row[] };
      } finally {
        connection.release();
      }
    }
  };

  return {
    client,
    queryable,
    async connectPair() {
      const first = await connect();
      try {
        return [first, await connect()];
      } catch (error) {
        first.release();
        throw error;
      }
    },
    async close() {
      try {
        await client.query(`drop schema if exists ${quoteIdentifier(schema)} cascade`);
      } finally {
        client.release();
        await pool.end();
      }
    }
  };
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe Postgres identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

function setSearchPath(client: pg.PoolClient, schema: string): Promise<pg.QueryResult> {
  return client.query(`set search_path to ${quoteIdentifier(schema)}`);
}

async function canConnect(connectionString: string): Promise<boolean> {
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 500
  });

  try {
    const client = await pool.connect();
    client.release();
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => undefined);
  }
}
