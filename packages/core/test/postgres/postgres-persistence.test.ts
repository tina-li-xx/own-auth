import { describe, expect, it, vi } from "vitest";
import { createPostgresPersistence } from "../../src/postgres/postgres-persistence.js";

type PostgresPoolLoader = NonNullable<
  Parameters<typeof createPostgresPersistence>[1]
>;
type OwnedPostgresPool = Awaited<ReturnType<PostgresPoolLoader>>;

function createPool() {
  return {
    query: vi.fn(async () => ({ rows: [] })),
    end: vi.fn(async () => undefined)
  } satisfies OwnedPostgresPool;
}

describe("lazy Postgres persistence", () => {
  it("loads one shared pool for concurrent first queries", async () => {
    const pool = createPool();
    const loader = vi.fn(async () => pool);
    const persistence = createPostgresPersistence(
      "postgres://localhost/own_auth",
      loader
    );

    expect(loader).not.toHaveBeenCalled();

    await Promise.all([
      persistence.storage.getUserById("usr_1"),
      persistence.rateLimitStore.reset("signin:usr_1")
    ]);

    expect(loader).toHaveBeenCalledOnce();
    expect(pool.query).toHaveBeenCalledTimes(2);
    await persistence.close();
    expect(pool.end).toHaveBeenCalledOnce();
  });

  it("preserves driver initialization and query failures", async () => {
    const initializationFailure = Object.assign(new Error("driver unavailable"), {
      code: "DRIVER_UNAVAILABLE"
    });
    const initialization = createPostgresPersistence(
      "postgres://localhost/own_auth",
      async () => {
        throw initializationFailure;
      }
    );

    await expect(
      initialization.storage.getUserById("usr_1")
    ).rejects.toBe(initializationFailure);

    const queryFailure = Object.assign(new Error("connection refused"), {
      code: "ECONNREFUSED"
    });
    const pool = createPool();
    pool.query.mockRejectedValueOnce(queryFailure);
    const persistence = createPostgresPersistence(
      "postgres://localhost/own_auth",
      async () => pool
    );

    await expect(persistence.storage.getUserById("usr_1")).rejects.toBe(queryFailure);
  });

  it("closes without loading Postgres when it was never used", async () => {
    const loader = vi.fn<PostgresPoolLoader>();
    const persistence = createPostgresPersistence(
      "postgres://localhost/own_auth",
      loader
    );

    const firstClose = persistence.close();
    const secondClose = persistence.close();

    expect(secondClose).toBe(firstClose);
    await firstClose;
    expect(loader).not.toHaveBeenCalled();
  });

  it("waits for initialization before closing the pool", async () => {
    const pool = createPool();
    let resolvePool: ((pool: OwnedPostgresPool) => void) | undefined;
    const pendingPool = new Promise<OwnedPostgresPool>((resolve) => {
      resolvePool = resolve;
    });
    const loader = vi.fn(() => pendingPool);
    const persistence = createPostgresPersistence(
      "postgres://localhost/own_auth",
      loader
    );

    const query = persistence.storage.getUserById("usr_1");
    const close = persistence.close();

    expect(pool.end).not.toHaveBeenCalled();
    resolvePool?.(pool);

    await expect(query).rejects.toMatchObject({
      code: "auth_closed",
      message: "Own Auth has been closed"
    });
    await close;
    expect(pool.query).not.toHaveBeenCalled();
    expect(pool.end).toHaveBeenCalledOnce();
  });

  it("preserves initialization failures when close races with loading", async () => {
    const failure = Object.assign(new Error("database unavailable"), {
      code: "ECONNREFUSED"
    });
    let rejectPool: ((error: Error) => void) | undefined;
    const pendingPool = new Promise<OwnedPostgresPool>((_resolve, reject) => {
      rejectPool = reject;
    });
    const persistence = createPostgresPersistence(
      "postgres://localhost/own_auth",
      () => pendingPool
    );

    const query = persistence.storage.getUserById("usr_1");
    const close = persistence.close();
    rejectPool?.(failure);

    await expect(query).rejects.toBe(failure);
    await expect(close).rejects.toBe(failure);
  });

  it("ends an initialized pool once and rejects later queries", async () => {
    const pool = createPool();
    const persistence = createPostgresPersistence(
      "postgres://localhost/own_auth",
      async () => pool
    );

    await persistence.storage.getUserById("usr_1");
    await Promise.all([persistence.close(), persistence.close()]);

    expect(pool.end).toHaveBeenCalledOnce();
    await expect(persistence.storage.getUserById("usr_1")).rejects.toMatchObject({
      code: "auth_closed",
      statusCode: 503
    });
  });

  it("validates the database URL before creating persistence", () => {
    expect(() => createPostgresPersistence("not-a-url")).toThrow(
      "DATABASE_URL must be a valid postgres:// or postgresql:// connection URL."
    );
    expect(() => createPostgresPersistence("https://database.example.com/auth")).toThrow(
      "DATABASE_URL must be a valid postgres:// or postgresql:// connection URL."
    );
    expect(() => createPostgresPersistence("postgresql://localhost/own_auth")).not.toThrow();
  });
});
