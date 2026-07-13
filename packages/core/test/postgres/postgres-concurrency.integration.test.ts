import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  expectOneWinner,
  uniquePhone
} from "../concurrency-helpers.js";
import {
  describeAtomicAdapterConformance,
  type AtomicAdapterHarness
} from "../conformance/atomic-adapter-conformance.js";
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

  it("allows only one concurrent magic-link verification", async () => {
    await withConcurrentAuth(database, "consumeToken", async (harness) => {
      const email = uniqueEmail("magic");
      await harness.auth[0].requestMagicLink({ email });
      const token = harness.emailProvider.messages.at(-1)?.token ?? "";

      expectOneWinner(
        await Promise.allSettled([
          harness.auth[0].verifyMagicLink({ token }),
          harness.auth[1].verifyMagicLink({ token })
        ]),
        "token_already_used"
      );

      const user = await harness.storage[0].getUserByEmail(email);
      expect(user).not.toBeNull();
      await expect(harness.storage[0].listSessionsByUserId(user?.id ?? "")).resolves.toHaveLength(1);
    });
  });

  it("allows only one concurrent email verification", async () => {
    await withConcurrentAuth(database, "consumeToken", async (harness) => {
      const email = uniqueEmail("verify");
      await harness.auth[0].signUpEmailPassword({
        email,
        password: "correct-horse"
      });
      await harness.auth[0].requestEmailVerification({ email });
      const token = harness.emailProvider.messages.at(-1)?.token ?? "";

      expectOneWinner(
        await Promise.allSettled([
          harness.auth[0].verifyEmail({ token }),
          harness.auth[1].verifyEmail({ token })
        ]),
        "token_already_used"
      );

      await expect(harness.storage[0].getUserByEmail(email)).resolves.toMatchObject({
        emailVerifiedAt: expect.any(Date)
      });
    });
  });

  it("allows only one concurrent password reset", async () => {
    await withConcurrentAuth(database, "consumeToken", async (harness) => {
      const email = uniqueEmail("reset");
      await harness.auth[0].signUpEmailPassword({
        email,
        password: "correct-horse"
      });
      await harness.auth[0].requestPasswordReset({ email });
      const token = harness.emailProvider.messages.at(-1)?.token ?? "";
      const passwords = ["new-password-one", "new-password-two"] as const;

      const winner = expectOneWinner(
        await Promise.allSettled([
          harness.auth[0].resetPassword({ token, newPassword: passwords[0] }),
          harness.auth[1].resetPassword({ token, newPassword: passwords[1] })
        ]),
        "token_already_used"
      );

      await expect(harness.auth[0].signInEmailPassword({
        email,
        password: passwords[winner]!
      })).resolves.toMatchObject({ user: { email } });
    });
  });

  it("allows only one concurrent invitation acceptance", async () => {
    await withConcurrentAuth(database, "consumeToken", async (harness) => {
      const owner = await harness.auth[0].signUpEmailPassword({
        email: uniqueEmail("owner"),
        password: "correct-horse"
      });
      const invited = await harness.auth[0].signUpEmailPassword({
        email: uniqueEmail("invited"),
        password: "correct-horse"
      });
      const { organisation } = await harness.auth[0].createOrganisation({
        name: `Concurrent ${randomUUID()}`,
        ownerUserId: owner.user.id
      });
      const invite = await harness.auth[0].inviteMember({
        organisationId: organisation.id,
        email: invited.user.email ?? "",
        invitedByUserId: owner.user.id
      });
      const input = { token: invite.token ?? "", userId: invited.user.id };

      expectOneWinner(
        await Promise.allSettled([
          harness.auth[0].acceptInvite(input),
          harness.auth[1].acceptInvite(input)
        ]),
        "token_already_used"
      );

      const members = await harness.storage[0].listOrganisationMembers(organisation.id);
      expect(members.filter((member) => member.userId === invited.user.id)).toHaveLength(1);
    });
  });

  it("allows only one concurrent SMS OTP verification", async () => {
    await withConcurrentAuth(database, "consumeSmsOtp", async (harness) => {
      const phone = uniquePhone();
      await harness.auth[0].requestSmsOtp({ phone });
      const code = harness.smsProvider.messages.at(-1)?.code ?? "";

      expectOneWinner(
        await Promise.allSettled([
          harness.auth[0].verifySmsOtp({ phone, code }),
          harness.auth[1].verifySmsOtp({ phone, code })
        ]),
        "invalid_otp"
      );

      const user = await harness.storage[0].getUserByPhone(phone);
      expect(user).not.toBeNull();
      await expect(harness.storage[0].listSessionsByUserId(user?.id ?? "")).resolves.toHaveLength(1);
    });
  });

  it("counts concurrent wrong SMS OTP attempts", async () => {
    await withConcurrentAuth(database, "incrementSmsOtpAttempts", async (harness) => {
      const phone = uniquePhone();
      await harness.auth[0].requestSmsOtp({ phone });
      const validCode = harness.smsProvider.messages.at(-1)?.code ?? "";
      const wrongCode = validCode === "000000" ? "111111" : "000000";

      const results = await Promise.allSettled([
        harness.auth[0].verifySmsOtp({ phone, code: wrongCode }),
        harness.auth[1].verifySmsOtp({ phone, code: wrongCode })
      ]);

      expect(results).toEqual([
        expect.objectContaining({ status: "rejected" }),
        expect.objectContaining({ status: "rejected" })
      ]);
      await expect(
        harness.storage[0].getLatestSmsOtp(phone, "phone_login")
      ).resolves.toMatchObject({ attempts: 2 });
    }, { maxAttempts: 2 });
  });
});

type Auth = ReturnType<typeof createOwnAuth>;
type StorageBarrierMethod =
  | "consumeToken"
  | "consumeSmsOtp"
  | "incrementSmsOtpAttempts";

interface ConcurrentAuthHarness {
  auth: readonly [Auth, Auth];
  storage: readonly [AuthStorage, AuthStorage];
  emailProvider: MemoryEmailProvider;
  smsProvider: MemorySmsProvider;
}

async function withConcurrentAuth(
  database: PostgresTestDatabase,
  barrierMethod: StorageBarrierMethod,
  run: (harness: ConcurrentAuthHarness) => Promise<void>,
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
  const tokenPepper = `concurrency-${randomUUID()}`;
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
    await run({ auth, storage, emailProvider, smsProvider });
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

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}
