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
  });
}

function requireHarness(
  harness: AtomicAdapterHarness | undefined
): AtomicAdapterHarness {
  if (!harness) {
    throw new Error("Atomic adapter harness is not initialized");
  }
  return harness;
}
