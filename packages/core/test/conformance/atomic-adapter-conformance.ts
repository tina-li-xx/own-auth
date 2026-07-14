import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RateLimitStore } from "../../src/rate-limit.js";
import type { AuthStorage } from "../../src/storage.js";
import { uniquePhone } from "../concurrency-helpers.js";

export interface AtomicAdapterHarness {
  storage: readonly [AuthStorage, AuthStorage];
  rateLimits: readonly [RateLimitStore, RateLimitStore];
  close(): Promise<void> | void;
}

export function describeAtomicAdapterConformance(
  adapterName: string,
  createHarness: () => Promise<AtomicAdapterHarness>
): void {
  describe(`${adapterName} atomic adapter conformance`, () => {
    let harness: AtomicAdapterHarness | undefined;

    beforeEach(async () => {
      harness = await createHarness();
    });

    afterEach(async () => {
      await harness?.close();
      harness = undefined;
    });

    it("allows only one connection to consume a token", async () => {
      const { storage } = requireHarness(harness);
      const now = new Date();
      const tokenHash = `token_${randomUUID()}`;
      await storage[0].createToken({
        id: `tok_${randomUUID()}`,
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

      const results = await Promise.all([
        storage[0].consumeToken(tokenHash, "magic_link", now),
        storage[1].consumeToken(tokenHash, "magic_link", now)
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
      expect(results.filter((result) => result === null)).toHaveLength(1);
    });

    it("never consumes an expired token", async () => {
      const { storage } = requireHarness(harness);
      const now = new Date();
      const tokenHash = `expired_${randomUUID()}`;
      await storage[0].createToken({
        id: `tok_${randomUUID()}`,
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

      await expect(
        storage[0].consumeToken(tokenHash, "password_reset", now)
      ).resolves.toBeNull();
    });

    it("allows only one connection to consume an OTP", async () => {
      const { storage } = requireHarness(harness);
      const now = new Date();
      const otpId = `otp_${randomUUID()}`;
      await storage[0].createSmsOtp({
        id: otpId,
        phone: uniquePhone(),
        userId: null,
        codeHash: `hash_${randomUUID()}`,
        purpose: "phone_login",
        expiresAt: new Date(now.getTime() + 60_000),
        attempts: 0,
        maxAttempts: 3,
        consumedAt: null,
        createdAt: now,
        lastSentAt: now
      });

      const results = await Promise.all([
        storage[0].consumeSmsOtp(otpId, now),
        storage[1].consumeSmsOtp(otpId, now)
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
      expect(results.filter((result) => result === null)).toHaveLength(1);
      expect(results.find(Boolean)?.attempts).toBe(1);
    });

    it("does not lose concurrent OTP attempts", async () => {
      const { storage } = requireHarness(harness);
      const now = new Date();
      const otpId = `otp_${randomUUID()}`;
      await storage[0].createSmsOtp({
        id: otpId,
        phone: uniquePhone(),
        userId: null,
        codeHash: `hash_${randomUUID()}`,
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

      expect(attempts.map((otp) => otp?.attempts).sort()).toEqual([1, 2]);
      await expect(storage[0].incrementSmsOtpAttempts(otpId, now)).resolves.toBeNull();
    });

    it("does not lose concurrent rate-limit hits", async () => {
      const { rateLimits } = requireHarness(harness);
      const key = `rate_${randomUUID()}`;
      const limit = 10;
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          rateLimits[index % rateLimits.length]!.hit(key, 60_000, limit)
        )
      );

      expect(results.map((result) => result.count).sort((a, b) => a - b)).toEqual(
        Array.from({ length: 20 }, (_, index) => index + 1)
      );
      expect(results.filter((result) => result.allowed)).toHaveLength(limit);
    });

    it.each(["redirect", "one_tap"] as const)(
      "allows only one connection to consume a %s OAuth transaction",
      async (flowKind) => {
        const { storage } = requireHarness(harness);
        const now = new Date();
        const stateHash = `oauth_${randomUUID()}`;
        await storage[0].createOAuthTransaction({
          id: `oat_${randomUUID()}`,
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

        expectSingleWinner(await Promise.all([
          storage[0].consumeOAuthTransaction(stateHash, flowKind, now),
          storage[1].consumeOAuthTransaction(stateHash, flowKind, now)
        ]));
      }
    );

    it("allows only one connection to consume a TOTP timestep", async () => {
      const { storage } = requireHarness(harness);
      const userId = await createAtomicUser(storage[0]);
      const now = new Date();
      const factorId = `mfa_${randomUUID()}`;
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

      expectSingleWinner(await Promise.all([
        storage[0].useTotpTimestep(factorId, 101, now),
        storage[1].useTotpTimestep(factorId, 101, now)
      ]));
    });

    it("allows only one connection to consume a recovery code", async () => {
      const { storage } = requireHarness(harness);
      const userId = await createAtomicUser(storage[0]);
      const now = new Date();
      const codeHash = `recovery_${randomUUID()}`;
      await storage[0].replaceRecoveryCodes(userId, [{
        id: `mfr_${randomUUID()}`,
        userId,
        codeHash,
        consumedAt: null,
        createdAt: now
      }]);

      expectSingleWinner(await Promise.all([
        storage[0].consumeRecoveryCode(userId, codeHash, now),
        storage[1].consumeRecoveryCode(userId, codeHash, now)
      ]));
    });

    it("allows only one connection to consume an MFA challenge", async () => {
      const { storage } = requireHarness(harness);
      const userId = await createAtomicUser(storage[0]);
      const now = new Date();
      const challengeId = `mfc_${randomUUID()}`;
      await storage[0].createMfaChallenge({
        id: challengeId,
        userId,
        tokenHash: `challenge_${randomUUID()}`,
        primaryMethod: "password",
        methods: ["totp"],
        attempts: 0,
        maxAttempts: 5,
        expiresAt: new Date(now.getTime() + 60_000),
        consumedAt: null,
        createdAt: now
      });

      expectSingleWinner(await Promise.all([
        storage[0].consumeMfaChallenge(challengeId, now),
        storage[1].consumeMfaChallenge(challengeId, now)
      ]));
    });

    it("allows only one connection to rotate an OAuth credential version", async () => {
      const { storage } = requireHarness(harness);
      const userId = await createAtomicUser(storage[0]);
      const now = new Date();
      const account = await storage[0].createAccount({
        id: `acct_${randomUUID()}`,
        userId,
        provider: "google",
        providerAccountId: `google_${randomUUID()}`,
        providerEmail: null,
        providerPhone: null,
        createdAt: now,
        updatedAt: now
      });
      const credential = await storage[0].upsertOAuthCredential({
        id: `oac_${randomUUID()}`,
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

      expectSingleWinner(await Promise.all([
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
      ]));
    });

    it("allows only one connection to consume a WebAuthn challenge", async () => {
      const { storage } = requireHarness(harness);
      const now = new Date();
      const challengeHash = `webauthn_${randomUUID()}`;
      await storage[0].createWebAuthnChallenge({
        id: `wac_${randomUUID()}`,
        challengeHash,
        userId: null,
        mfaChallengeId: null,
        purpose: "authentication",
        expiresAt: new Date(now.getTime() + 60_000),
        consumedAt: null,
        createdAt: now
      });

      expectSingleWinner(await Promise.all([
        storage[0].consumeWebAuthnChallenge(challengeHash, "authentication", now),
        storage[1].consumeWebAuthnChallenge(challengeHash, "authentication", now)
      ]));
    });
  });
}

async function createAtomicUser(storage: AuthStorage): Promise<string> {
  const now = new Date();
  const id = `usr_${randomUUID()}`;
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

function expectSingleWinner(results: Array<unknown | null>): void {
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(results.filter((result) => result === null)).toHaveLength(1);
}

function requireHarness(
  harness: AtomicAdapterHarness | undefined
): AtomicAdapterHarness {
  if (!harness) {
    throw new Error("Atomic adapter harness is not initialized");
  }
  return harness;
}
