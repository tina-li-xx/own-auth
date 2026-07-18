import { describe, expect, it } from "vitest";
import { PostgresAuthStorage } from "../../src/postgres/index.js";
import { RecordingDb } from "./recording-postgres.js";

const thumbprint = "A".repeat(43);

describe("Postgres DPoP storage", () => {
  it("uses an atomic conflict-safe insert for replay protection", async () => {
    const db = new RecordingDb();
    const storage = new PostgresAuthStorage(db).authorizationServerStorage.dpopStorage;
    const consumedAt = new Date("2026-07-17T12:00:00.000Z");
    const expiresAt = new Date("2026-07-17T12:06:00.000Z");
    db.queueRows([{ proof_hash: "hashed-proof" }]);
    db.queueRows([]);

    await expect(storage.consumeDpopProof({
      proofHash: "hashed-proof",
      consumedAt,
      expiresAt
    })).resolves.toBe(true);
    await expect(storage.consumeDpopProof({
      proofHash: "hashed-proof",
      consumedAt,
      expiresAt
    })).resolves.toBe(false);

    expect(db.calls[0]?.sql).toContain("on conflict (proof_hash) do nothing");
    expect(db.calls[0]?.params).toEqual(["hashed-proof", consumedAt, expiresAt]);
    expect(JSON.stringify(db.calls)).not.toContain("dpop+jwt");
  });

  it("loads and consumes authorization codes with an exact DPoP binding", async () => {
    const db = new RecordingDb();
    const storage = new PostgresAuthStorage(db).authorizationServerStorage.dpopStorage;
    const now = new Date("2026-07-17T12:00:00.000Z");
    db.queueRows([{ dpop_jkt: thumbprint, dpop_required: true }]);
    db.queueRows([]);

    await expect(storage.findAuthorizationCodeDpopBinding({
      codeHash: "code-hash",
      authorizationClientId: "ocli_1",
      redirectUri: "https://client.example.com/callback",
      codeChallenge: "code-challenge",
      resourceIdentifier: "https://api.example.com/",
      now
    })).resolves.toEqual({ dpopJkt: thumbprint, dpopRequired: true });

    await expect(storage.consumeDpopAuthorizationCode(
      "code-hash",
      "ocli_1",
      "https://client.example.com/callback",
      "code-challenge",
      "https://api.example.com/",
      thumbprint,
      now
    )).resolves.toBeNull();
    expect(db.calls[1]?.sql).toContain("dpop_jkt is not distinct from $6");
    expect(db.calls[1]?.params[5]).toBe(thumbprint);
  });

  it("cleans up replay hashes by their protected retention expiry", async () => {
    const db = new RecordingDb();
    const storage = new PostgresAuthStorage(db).authorizationServerStorage.dpopStorage;
    const expiredBefore = new Date("2026-07-17T13:00:00.000Z");
    db.queueRows([{ proof_hash: "first" }, { proof_hash: "second" }]);

    await expect(storage.cleanupDpopProofs(expiredBefore)).resolves.toBe(2);
    expect(db.lastCall.sql).toContain("expires_at <= $1");
    expect(db.lastCall.params).toEqual([expiredBefore]);
  });
});
