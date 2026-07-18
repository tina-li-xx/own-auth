import { describe, expect, it } from "vitest";
import { D1AuthStorage } from "../../src/d1/index.js";
import { RecordingD1 } from "./recording-d1.js";

const thumbprint = "A".repeat(43);

describe("D1 DPoP storage", () => {
  it("atomically inserts one replay hash without storing proof material", async () => {
    const database = new RecordingD1();
    const storage = new D1AuthStorage(database).authorizationServerStorage.dpopStorage;
    const consumedAt = new Date("2026-07-17T12:00:00.000Z");
    const expiresAt = new Date("2026-07-17T12:06:00.000Z");
    database.queue([{ proof_hash: "hashed-proof" }]);
    database.queue([]);

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

    expect(database.calls[0]?.sql).toContain("on conflict (proof_hash) do nothing");
    expect(database.calls[0]?.values).toEqual([
      "hashed-proof",
      consumedAt.getTime(),
      expiresAt.getTime()
    ]);
    expect(JSON.stringify(database.calls)).not.toContain("dpop+jwt");
  });

  it("loads and consumes authorization codes with an exact DPoP binding", async () => {
    const database = new RecordingD1();
    const storage = new D1AuthStorage(database).authorizationServerStorage.dpopStorage;
    const now = new Date("2026-07-17T12:00:00.000Z");
    database.queue([{ dpop_jkt: thumbprint, dpop_required: 1 }]);
    database.queue([]);

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
    expect(database.calls[1]?.sql).toContain("dpop_jkt is ?6");
    expect(database.calls[1]?.values[5]).toBe(thumbprint);
  });

  it("deletes only proof rows whose retention window has expired", async () => {
    const database = new RecordingD1();
    const storage = new D1AuthStorage(database).authorizationServerStorage.dpopStorage;
    const expiredBefore = new Date("2026-07-17T13:00:00.000Z");
    database.responses.push({ success: true, results: [], meta: { changes: 2 } });

    await expect(storage.cleanupDpopProofs(expiredBefore)).resolves.toBe(2);
    expect(database.calls[0]?.sql).toContain("expires_at <= ?1");
    expect(database.calls[0]?.values).toEqual([expiredBefore.getTime()]);
  });
});
