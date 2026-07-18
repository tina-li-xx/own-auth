import { describe, expect, it } from "vitest";
import {
  createDpopProofJwt,
  DpopProofValidationError,
  verifyDpopProof
} from "../src/dpop-crypto.js";
import { createDpopProof, generateDpopKeyPair } from "../src/dpop.js";

const requestUrl = "https://api.example.com/documents?draft=true#section";
const canonicalUrl = "https://api.example.com/documents";
const accessToken = "oa_at_dpop_test";

describe("DPoP Web Crypto helpers", () => {
  it("creates an ES256 proof bound to a method, canonical URL, and access token", async () => {
    const keyPair = await generateDpopKeyPair();
    const proof = await createDpopProof({
      keyPair,
      method: "get",
      url: requestUrl,
      accessToken
    });

    await expect(verifyDpopProof({
      proof,
      method: "GET",
      url: canonicalUrl,
      accessToken,
      proofTtlMs: 5 * 60 * 1_000,
      clockSkewMs: 60 * 1_000
    })).resolves.toMatchObject({
      jwkThumbprint: keyPair.jwkThumbprint,
      proofId: expect.any(String)
    });
  });

  it("rejects proofs with the wrong access-token hash", async () => {
    const keyPair = await generateDpopKeyPair();
    const proof = await createDpopProof({
      keyPair,
      method: "GET",
      url: canonicalUrl,
      accessToken
    });

    const error = await verifyDpopProof({
      proof,
      method: "GET",
      url: canonicalUrl,
      accessToken: "oa_at_other",
      proofTtlMs: 5 * 60 * 1_000,
      clockSkewMs: 60 * 1_000
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DpopProofValidationError);
    expect(error).toMatchObject({ reason: "token_hash_mismatch" });
  });

  it("rejects a tampered ES256 signature with a safe failure", async () => {
    const keyPair = await generateDpopKeyPair();
    const proof = await createDpopProof({
      keyPair,
      method: "GET",
      url: canonicalUrl
    });
    const [header = "", payload = "", signature = ""] = proof.split(".");
    const replacement = signature.startsWith("A") ? "B" : "A";
    const tampered = `${header}.${payload}.${replacement}${signature.slice(1)}`;

    await expect(verifyDpopProof({
      proof: tampered,
      method: "GET",
      url: canonicalUrl,
      proofTtlMs: 5 * 60 * 1_000,
      clockSkewMs: 60 * 1_000
    })).rejects.toMatchObject({
      message: "The DPoP proof is invalid",
      reason: "signature_invalid"
    });
  });

  it("rejects stale, method-mismatched, and URL-mismatched proofs safely", async () => {
    const keyPair = await generateDpopKeyPair();
    const now = new Date("2026-07-17T12:00:00.000Z");
    const proof = await createDpopProofJwt({
      keyPair,
      method: "POST",
      url: canonicalUrl,
      issuedAt: Math.floor(now.getTime() / 1_000) - 360,
      proofId: "fixed-proof-id"
    });
    const base = {
      proof,
      proofTtlMs: 5 * 60 * 1_000,
      clockSkewMs: 60 * 1_000,
      now
    };

    await expect(verifyDpopProof({
      ...base,
      method: "POST",
      url: canonicalUrl
    })).rejects.toMatchObject({ reason: "expired" });
    await expect(verifyDpopProof({
      ...base,
      method: "GET",
      url: canonicalUrl
    })).rejects.toMatchObject({ reason: "method_mismatch" });
    await expect(verifyDpopProof({
      ...base,
      method: "POST",
      url: "https://other.example.com/documents"
    })).rejects.toMatchObject({ reason: "url_mismatch" });
  });
});
