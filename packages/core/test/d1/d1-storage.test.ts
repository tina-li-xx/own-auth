import { describe, expect, it } from "vitest";
import { AuthError } from "../../src/errors.js";
import {
  D1AuthStorage,
  D1RateLimitStore,
  createD1Persistence,
  type D1BindableValue,
  type D1DatabaseLike,
  type D1PreparedStatementLike,
  type D1ResultLike
} from "../../src/d1/index.js";
import type { Account, User } from "../../src/types.js";

interface D1Call {
  sql: string;
  values: readonly D1BindableValue[];
}

class RecordingD1 implements D1DatabaseLike {
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

describe("D1 persistence", () => {
  it("creates users with parameterized SQL and maps SQLite rows", async () => {
    const database = new RecordingD1();
    const storage = new D1AuthStorage(database);
    const user = userEntity();
    database.queue([userRow()]);

    const created = await storage.createUser(user);

    expect(created).toMatchObject({
      id: "usr_1",
      email: "alice@example.com",
      emailVerifiedAt: null,
      metadata: { plan: "pro" }
    });
    expect(database.calls[0]?.sql).toContain("insert into own_auth_users");
    expect(database.calls[0]?.sql).not.toContain("hash_1");
    expect(database.calls[0]?.values).toContain("hash_1");
    expect(database.calls[0]?.values).toContain('{"plan":"pro"}');
    expect(database.calls[0]?.values).toContain(user.createdAt.getTime());
  });

  it("consumes a token with one conditional update", async () => {
    const database = new RecordingD1();
    const storage = new D1AuthStorage(database);
    const consumedAt = new Date("2026-07-15T12:05:00.000Z");
    database.queue([tokenRow(consumedAt.getTime())]);

    const token = await storage.consumeToken("token_hash", "magic_link", consumedAt);

    expect(token?.usedAt).toEqual(consumedAt);
    expect(database.calls[0]?.sql).toContain("used_at is null");
    expect(database.calls[0]?.sql).toContain("expires_at > ?3");
    expect(database.calls[0]?.values).toEqual([
      "token_hash",
      "magic_link",
      consumedAt.getTime()
    ]);
  });

  it("maps D1 identity collisions to typed Own Auth errors", async () => {
    const database = new RecordingD1();
    const storage = new D1AuthStorage(database);
    database.batchError = new Error(
      "D1_ERROR: UNIQUE constraint failed: index 'own_auth_users_email_unique'"
    );

    await expect(storage.createUserAndAccount(userEntity(), accountEntity())).rejects.toMatchObject({
      code: "email_already_exists",
      statusCode: 409
    } satisfies Partial<AuthError>);
  });

  it("uses the same D1 binding for auth data and rate limits", async () => {
    const database = new RecordingD1();
    const persistence = createD1Persistence(database);
    database.queue([{ count: 1, reset_at: 1_786_291_260_000 }]);

    await persistence.rateLimitStore.hit("signin:alice@example.com", 60_000, 3);

    expect(persistence.storage).toBeInstanceOf(D1AuthStorage);
    expect(persistence.rateLimitStore).toBeInstanceOf(D1RateLimitStore);
    expect(database.calls[0]?.sql).toContain("own_auth_rate_limits");
    expect(database.calls[0]?.values[0]).toBe("signin:alice@example.com");
  });
});

function userEntity(): User {
  const now = new Date("2026-07-15T12:00:00.000Z");
  return {
    id: "usr_1",
    email: "alice@example.com",
    emailVerifiedAt: null,
    phone: null,
    phoneVerifiedAt: null,
    passwordHash: "hash_1",
    name: "Alice",
    imageUrl: null,
    disabledAt: null,
    metadata: { plan: "pro" },
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null
  };
}

function accountEntity(): Account {
  return {
    id: "acc_1",
    userId: "usr_1",
    provider: "password",
    providerAccountId: "alice@example.com",
    providerEmail: "alice@example.com",
    providerPhone: null,
    createdAt: new Date("2026-07-15T12:00:00.000Z"),
    updatedAt: new Date("2026-07-15T12:00:00.000Z")
  };
}

function userRow(): Record<string, unknown> {
  return {
    id: "usr_1",
    email: "alice@example.com",
    email_verified_at: null,
    phone: null,
    phone_verified_at: null,
    password_hash: "hash_1",
    name: "Alice",
    image_url: null,
    disabled_at: null,
    metadata: '{"plan":"pro"}',
    created_at: 1_752_580_800_000,
    updated_at: 1_752_580_800_000,
    last_login_at: null
  };
}

function tokenRow(usedAt: number): Record<string, unknown> {
  return {
    id: "tok_1",
    token_hash: "token_hash",
    type: "magic_link",
    user_id: "usr_1",
    email: "alice@example.com",
    phone: null,
    organisation_id: null,
    expires_at: usedAt + 60_000,
    used_at: usedAt,
    created_at: usedAt - 60_000
  };
}
