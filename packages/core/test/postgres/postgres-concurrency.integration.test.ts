import { afterAll, beforeAll, describe, it } from "vitest";
import {
  createOwnAuth,
  MemoryEmailProvider,
  MemorySmsProvider
} from "../../src/index.js";
import {
  PostgresAuthStorage,
  PostgresRateLimitStore
} from "../../src/postgres/index.js";
import type { AuthStorage } from "../../src/storage.js";
import {
  describeAtomicAdapterConformance,
  type AtomicAdapterHarness
} from "../conformance/atomic-adapter-conformance.js";
import {
  authConcurrencyCases,
  type AuthConcurrencyHarness,
  type StorageBarrierMethod
} from "../conformance/auth-concurrency-cases.js";
import {
  createPostgresTestDatabase,
  hasPostgresTestDatabase,
  type PostgresTestDatabase
} from "./postgres-test-database.js";

const describeWithDatabase = hasPostgresTestDatabase ? describe : describe.skip;

describeWithDatabase("Postgres concurrency integration", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  });

  afterAll(async () => {
    await database?.close();
  });

  describeAtomicAdapterConformance("Postgres", async () => {
    const [first, second] = await database.connectPair();
    return {
      storage: [new PostgresAuthStorage(first), new PostgresAuthStorage(second)],
      rateLimits: [
        new PostgresRateLimitStore(database.queryable),
        new PostgresRateLimitStore(database.queryable)
      ],
      close() {
        first.release();
        second.release();
      }
    } satisfies AtomicAdapterHarness;
  });

  for (const testCase of authConcurrencyCases) {
    it(testCase.name, async () => {
      await withConcurrentAuth(
        database,
        testCase.barrierMethod,
        testCase.run,
        testCase.sms
      );
    });
  }
});

type Auth = ReturnType<typeof createOwnAuth>;

async function withConcurrentAuth(
  database: PostgresTestDatabase,
  barrierMethod: StorageBarrierMethod,
  run: (harness: AuthConcurrencyHarness) => Promise<void>,
  sms: { maxAttempts?: number } = {}
): Promise<void> {
  const [first, second] = await database.connectPair();
  const wait = createTwoPartyBarrier();
  const emailProvider = new MemoryEmailProvider();
  const smsProvider = new MemorySmsProvider();
  const storage = [
    withMethodBarrier(new PostgresAuthStorage(first), barrierMethod, wait),
    withMethodBarrier(new PostgresAuthStorage(second), barrierMethod, wait)
  ] as const;
  const rateLimits = [
    new PostgresRateLimitStore(first),
    new PostgresRateLimitStore(second)
  ] as const;
  const tokenPepper = `concurrency-${crypto.randomUUID()}`;
  const createAuth = (index: 0 | 1): Auth => createOwnAuth({
    storage: storage[index],
    rateLimitStore: rateLimits[index],
    emailProvider,
    smsProvider,
    exposeRawTokens: true,
    baseUrl: "http://localhost:3000",
    tokenPepper,
    sms
  });
  const auth = [createAuth(0), createAuth(1)] as const;

  try {
    await run({ auth, storage });
  } finally {
    first.release();
    second.release();
  }
}

function withMethodBarrier(
  storage: AuthStorage,
  method: StorageBarrierMethod,
  wait: () => Promise<void>
): AuthStorage {
  // Hold both flows immediately before the atomic write so Postgres resolves the race.
  return new Proxy(storage as object, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") {
        return value;
      }
      if (property === method) {
        return async (...args: unknown[]) => {
          await wait();
          return value.apply(target, args);
        };
      }
      return value.bind(target);
    }
  }) as AuthStorage;
}

function createTwoPartyBarrier(): () => Promise<void> {
  let arrivals = 0;
  let release: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });

  return async () => {
    arrivals += 1;
    if (arrivals === 2) {
      release?.();
    }
    await ready;
  };
}
