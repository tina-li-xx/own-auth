import type { RateLimitStore } from "../../src/rate-limit.js";
import type { AuthStorage } from "../../src/storage.js";
import {
  assertConformanceArrayEqual,
  assertConformanceEqual,
  assertSingleValueWinner
} from "./conformance-assertions.js";
import {
  uniqueConformancePhone as uniquePhone,
  uniqueConformanceValue as uniqueValue
} from "./conformance-values.js";

export interface AtomicAdapterHarness {
  storage: readonly [AuthStorage, AuthStorage];
  rateLimits: readonly [RateLimitStore, RateLimitStore];
  close(): Promise<void> | void;
}

export interface AtomicAdapterCase {
  name: string;
  run(harness: AtomicAdapterHarness): Promise<void>;
}

export const atomicAdapterCases: readonly AtomicAdapterCase[] = [
  {
    name: "allows only one connection to consume a token",
    async run({ storage }) {
      const now = new Date();
      const tokenHash = uniqueValue("token");
      await storage[0].createToken({
        id: uniqueValue("tok"),
        tokenHash,
        type: "magic_link",
        userId: null,
        email: "atomic-token@example.com",
        phone: null,
        organisationId: null,
        expiresAt: new Date(now.getTime() + 60_000),
        usedAt: null,
        createdAt: now
      });

      assertSingleValueWinner(await Promise.all([
        storage[0].consumeToken(tokenHash, "magic_link", now),
        storage[1].consumeToken(tokenHash, "magic_link", now)
      ]), "token consumption");
    }
  },
  {
    name: "never consumes an expired token",
    async run({ storage }) {
      const now = new Date();
      const tokenHash = uniqueValue("expired");
      await storage[0].createToken({
        id: uniqueValue("tok"),
        tokenHash,
        type: "password_reset",
        userId: null,
        email: "expired-token@example.com",
        phone: null,
        organisationId: null,
        expiresAt: new Date(now.getTime() - 1),
        usedAt: null,
        createdAt: new Date(now.getTime() - 60_000)
      });

      assertConformanceEqual(
        await storage[0].consumeToken(tokenHash, "password_reset", now),
        null,
        "expired token result"
      );
    }
  },
  {
    name: "allows only one connection to consume an OTP",
    async run({ storage }) {
      const now = new Date();
      const otpId = uniqueValue("otp");
      await storage[0].createSmsOtp({
        id: otpId,
        phone: uniquePhone(),
        userId: null,
        codeHash: uniqueValue("hash"),
        purpose: "phone_login",
        expiresAt: new Date(now.getTime() + 60_000),
        attempts: 0,
        maxAttempts: 3,
        consumedAt: null,
        createdAt: now,
        lastSentAt: now
      });

      const winner = assertSingleValueWinner(await Promise.all([
        storage[0].consumeSmsOtp(otpId, now),
        storage[1].consumeSmsOtp(otpId, now)
      ]), "OTP consumption");
      assertConformanceEqual(winner.attempts, 1, "consumed OTP attempt count");
    }
  },
  {
    name: "does not lose concurrent OTP attempts",
    async run({ storage }) {
      const now = new Date();
      const otpId = uniqueValue("otp");
      await storage[0].createSmsOtp({
        id: otpId,
        phone: uniquePhone(),
        userId: null,
        codeHash: uniqueValue("hash"),
        purpose: "phone_login",
        expiresAt: new Date(now.getTime() + 60_000),
        attempts: 0,
        maxAttempts: 2,
        consumedAt: null,
        createdAt: now,
        lastSentAt: now
      });

      const attempts = await Promise.all([
        storage[0].incrementSmsOtpAttempts(otpId, now),
        storage[1].incrementSmsOtpAttempts(otpId, now)
      ]);
      assertConformanceArrayEqual(
        attempts.map((otp) => otp?.attempts).sort(),
        [1, 2],
        "concurrent OTP attempts"
      );
      assertConformanceEqual(
        await storage[0].incrementSmsOtpAttempts(otpId, now),
        null,
        "exhausted OTP attempt result"
      );
    }
  },
  {
    name: "does not lose concurrent rate-limit hits",
    async run({ rateLimits }) {
      const key = uniqueValue("rate");
      const limit = 10;
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          rateLimits[index % rateLimits.length]!.hit(key, 60_000, limit)
        )
      );

      assertConformanceArrayEqual(
        results.map((result) => result.count).sort((left, right) => left - right),
        Array.from({ length: 20 }, (_, index) => index + 1),
        "concurrent rate-limit counts"
      );
      assertConformanceEqual(
        results.filter((result) => result.allowed).length,
        limit,
        "allowed rate-limit hits"
      );
    }
  },
  ...(["redirect", "one_tap"] as const).map((flowKind): AtomicAdapterCase => ({
    name: `allows only one connection to consume a ${flowKind} OAuth transaction`,
    async run({ storage }) {
      const now = new Date();
      const stateHash = uniqueValue("oauth");
      await storage[0].createOAuthTransaction({
        id: uniqueValue("oat"),
        provider: "google",
        flowKind,
        intent: "sign_in",
        stateHash,
        destination: null,
        interactionMode: "redirect",
        openerOrigin: null,
        userId: null,
        expiresAt: new Date(now.getTime() + 60_000),
        consumedAt: null,
        createdAt: now
      });

      assertSingleValueWinner(await Promise.all([
        storage[0].consumeOAuthTransaction(stateHash, flowKind, now),
        storage[1].consumeOAuthTransaction(stateHash, flowKind, now)
      ]), `${flowKind} OAuth transaction consumption`);
    }
  })),
  {
    name: "allows only one connection to consume a TOTP timestep",
    async run({ storage }) {
      const userId = await createAtomicUser(storage[0]);
      const now = new Date();
      const factorId = uniqueValue("mfa");
      await storage[0].createTotpFactor({
        id: factorId,
        userId,
        status: "active",
        ciphertext: "ciphertext",
        nonce: "nonce",
        encryptionKeyId: "current",
        lastUsedTimestep: 100,
        createdAt: now,
        updatedAt: now,
        disabledAt: null
      });

      assertSingleValueWinner(await Promise.all([
        storage[0].useTotpTimestep(factorId, 101, now),
        storage[1].useTotpTimestep(factorId, 101, now)
      ]), "TOTP timestep consumption");
    }
  },
  {
    name: "allows only one connection to consume a recovery code",
    async run({ storage }) {
      const userId = await createAtomicUser(storage[0]);
      const now = new Date();
      const codeHash = uniqueValue("recovery");
      await storage[0].replaceRecoveryCodes(userId, [{
        id: uniqueValue("mfr"),
        userId,
        codeHash,
        consumedAt: null,
        createdAt: now
      }]);

      assertSingleValueWinner(await Promise.all([
        storage[0].consumeRecoveryCode(userId, codeHash, now),
        storage[1].consumeRecoveryCode(userId, codeHash, now)
      ]), "recovery-code consumption");
    }
  },
  {
    name: "allows only one connection to consume an MFA challenge",
    async run({ storage }) {
      const userId = await createAtomicUser(storage[0]);
      const now = new Date();
      const challengeId = uniqueValue("mfc");
      await storage[0].createMfaChallenge({
        id: challengeId,
        userId,
        tokenHash: uniqueValue("challenge"),
        primaryMethod: "password",
        methods: ["totp"],
        attempts: 0,
        maxAttempts: 5,
        expiresAt: new Date(now.getTime() + 60_000),
        consumedAt: null,
        createdAt: now
      });

      assertSingleValueWinner(await Promise.all([
        storage[0].consumeMfaChallenge(challengeId, now),
        storage[1].consumeMfaChallenge(challengeId, now)
      ]), "MFA challenge consumption");
    }
  },
  {
    name: "allows only one connection to rotate an OAuth credential version",
    async run({ storage }) {
      const userId = await createAtomicUser(storage[0]);
      const now = new Date();
      const account = await storage[0].createAccount({
        id: uniqueValue("acct"),
        userId,
        provider: "google",
        providerAccountId: uniqueValue("google"),
        providerEmail: null,
        providerPhone: null,
        createdAt: now,
        updatedAt: now
      });
      const credential = await storage[0].upsertOAuthCredential({
        id: uniqueValue("oac"),
        accountId: account.id,
        provider: "google",
        ciphertext: "version-one",
        nonce: "nonce-one",
        encryptionKeyId: "current",
        scopes: [],
        createdAt: now,
        updatedAt: now,
        rotatedAt: null
      });

      assertSingleValueWinner(await Promise.all([
        storage[0].rotateOAuthCredential(credential.id, "version-one", {
          ciphertext: "version-two-a",
          nonce: "nonce-two-a",
          updatedAt: now
        }),
        storage[1].rotateOAuthCredential(credential.id, "version-one", {
          ciphertext: "version-two-b",
          nonce: "nonce-two-b",
          updatedAt: now
        })
      ]), "OAuth credential rotation");
    }
  },
  {
    name: "allows only one connection to consume a WebAuthn challenge",
    async run({ storage }) {
      const now = new Date();
      const challengeHash = uniqueValue("webauthn");
      await storage[0].createWebAuthnChallenge({
        id: uniqueValue("wac"),
        challengeHash,
        userId: null,
        mfaChallengeId: null,
        purpose: "authentication",
        expiresAt: new Date(now.getTime() + 60_000),
        consumedAt: null,
        createdAt: now
      });

      assertSingleValueWinner(await Promise.all([
        storage[0].consumeWebAuthnChallenge(challengeHash, "authentication", now),
        storage[1].consumeWebAuthnChallenge(challengeHash, "authentication", now)
      ]), "WebAuthn challenge consumption");
    }
  },
  {
    name: "allows only one connection to update a passkey counter version",
    async run({ storage }) {
      const userId = await createAtomicUser(storage[0]);
      const now = new Date();
      const passkeyId = uniqueValue("pky");
      await storage[0].createPasskeyCredential({
        id: passkeyId,
        userId,
        credentialId: uniqueValue("credential"),
        publicKey: new Uint8Array([1, 2, 3, 4]),
        counter: 0,
        transports: ["internal"],
        deviceType: "singleDevice",
        backedUp: false,
        discoverable: true,
        name: "Atomic passkey",
        metadata: {},
        createdAt: now,
        updatedAt: now,
        lastUsedAt: null
      });

      const winner = assertSingleValueWinner(await Promise.all([
        storage[0].updatePasskeyCounter(passkeyId, 0, 1, now),
        storage[1].updatePasskeyCounter(passkeyId, 0, 2, now)
      ]), "passkey counter update");
      assertConformanceEqual(
        (await storage[0].getPasskeyCredentialById(passkeyId))?.counter,
        winner.counter,
        "stored passkey counter"
      );
    }
  }
];

async function createAtomicUser(storage: AuthStorage): Promise<string> {
  const now = new Date();
  const id = uniqueValue("usr");
  await storage.createUser({
    id,
    email: `${id}@example.com`,
    emailVerifiedAt: null,
    phone: null,
    phoneVerifiedAt: null,
    passwordHash: null,
    name: null,
    imageUrl: null,
    disabledAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null
  });
  return id;
}
