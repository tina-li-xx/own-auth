import { describe, expect, it } from "vitest";
import { PostgresRateLimitStore, type PostgresQueryable } from "../../src/postgres/index.js";

interface QueryCall {
  sql: string;
  params: readonly unknown[];
}

class RecordingDb implements PostgresQueryable {
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
    if (!call) {
      throw new Error("No query call was recorded");
    }

    return call;
  }
}

describe("PostgresRateLimitStore", () => {
  it("upserts rate-limit buckets with parameterized SQL", async () => {
    const db = new RecordingDb();
    const store = new PostgresRateLimitStore(db);
    db.queueRows([
      {
        count: 1,
        reset_at: "2026-07-09T12:00:00.000Z"
      }
    ]);

    const result = await store.hit("magic:ip:127.0.0.1", 60_000, 3);

    expect(result.count).toBe(1);
    expect(result.allowed).toBe(true);
    expect(result.resetAt).toEqual(new Date("2026-07-09T12:00:00.000Z"));
    expect(db.lastCall.sql).toContain("insert into own_auth_rate_limits");
    expect(db.lastCall.sql).toContain("on conflict (key) do update");
    expect(db.lastCall.sql).toContain("returning count, reset_at");
    expect(db.lastCall.sql).not.toContain("magic:ip:127.0.0.1");
    expect(db.lastCall.params[0]).toBe("magic:ip:127.0.0.1");
  });

  it("rejects hits over the limit", async () => {
    const db = new RecordingDb();
    const store = new PostgresRateLimitStore(db);
    db.queueRows([
      {
        count: 4,
        reset_at: "2026-07-09T12:00:00.000Z"
      }
    ]);

    const result = await store.hit("password:email:tina@example.com", 60_000, 3);

    expect(result.allowed).toBe(false);
    expect(result.count).toBe(4);
  });

  it("resets a bucket by key without interpolating input", async () => {
    const db = new RecordingDb();
    const store = new PostgresRateLimitStore(db);

    await store.reset("sms:phone:+15551234567");

    expect(db.lastCall.sql).toBe("delete from own_auth_rate_limits where key = $1");
    expect(db.lastCall.sql).not.toContain("+15551234567");
    expect(db.lastCall.params).toEqual(["sms:phone:+15551234567"]);
  });
});
