import { decodeBase64Url, encodeBase64Url } from "./encoding.js";
import type { CryptoKey, JWK } from "jose";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const dpopType = "dpop+jwt";
const supportedAlgorithm = "ES256";
const proofIdPattern = /^[\x21-\x7E]+$/;

export const dpopSigningAlgorithms = [supportedAlgorithm] as const;
export const dpopJwkThumbprintPattern = "^[A-Za-z0-9_-]{43}$";
export const maximumDpopProofBytes = 8 * 1024;
export const maximumDpopProofIdLength = 128;

const jwkThumbprintPattern = new RegExp(dpopJwkThumbprintPattern);

export type DpopProofFailure =
  | "algorithm_unsupported"
  | "expired"
  | "malformed"
  | "method_mismatch"
  | "signature_invalid"
  | "token_hash_mismatch"
  | "url_mismatch";

export class DpopProofValidationError extends Error {
  constructor(readonly reason: DpopProofFailure) {
    super("The DPoP proof is invalid");
    this.name = "DpopProofValidationError";
  }
}

export interface VerifiedDpopProof {
  jwkThumbprint: string;
  proofId: string;
  issuedAt: number;
}

export interface DpopCryptoKeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

export interface VerifyDpopProofInput {
  proof: string;
  method: string;
  url: string;
  accessToken?: string;
  proofTtlMs: number;
  clockSkewMs: number;
  now?: Date;
}

export async function generateDpopKeyPair(): Promise<DpopCryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createDpopProofJwt(input: {
  keyPair: DpopCryptoKeyPair;
  method: string;
  url: string;
  accessToken?: string;
  issuedAt?: number;
  proofId?: string;
}): Promise<string> {
  const jwk = await exportPublicJwk(input.keyPair.publicKey);
  const header = encodeJson({ typ: dpopType, alg: supportedAlgorithm, jwk });
  const payload = encodeJson({
    jti: input.proofId ?? randomProofId(),
    htm: normalizeMethod(input.method),
    htu: canonicalizeDpopUrl(input.url),
    iat: input.issuedAt ?? Math.floor(Date.now() / 1_000),
    ...(input.accessToken !== undefined
      ? { ath: await calculateDpopAccessTokenHash(input.accessToken) }
      : {})
  });
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    input.keyPair.privateKey,
    encoder.encode(signingInput)
  );
  return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyDpopProof(
  input: VerifyDpopProofInput
): Promise<VerifiedDpopProof> {
  if (
    typeof input.proof !== "string" ||
    !input.proof ||
    encoder.encode(input.proof).byteLength > maximumDpopProofBytes
  ) {
    throw invalid("malformed");
  }
  const [encodedHeader, encodedPayload, encodedSignature, extra] = input.proof.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature || extra) {
    throw invalid("malformed");
  }
  const header = decodeJson(encodedHeader);
  const claims = decodeJson(encodedPayload);
  if (header.typ !== dpopType || header.alg !== supportedAlgorithm) {
    throw invalid(header.alg === supportedAlgorithm ? "malformed" : "algorithm_unsupported");
  }
  const jwk = validatePublicJwk(header.jwk);
  const key = await importVerificationKey(jwk);
  let signature: Uint8Array;
  try {
    signature = decodeBase64Url(encodedSignature);
  } catch {
    throw invalid("malformed");
  }
  const signatureValid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    signature,
    encoder.encode(`${encodedHeader}.${encodedPayload}`)
  );
  if (!signatureValid) throw invalid("signature_invalid");

  const proofId = requiredProofId(claims.jti);
  const method = normalizeMethod(input.method);
  if (claims.htm !== method) throw invalid("method_mismatch");
  const expectedUrl = canonicalizeDpopUrl(input.url);
  if (
    typeof claims.htu !== "string" ||
    claims.htu !== canonicalizeDpopUrl(claims.htu) ||
    claims.htu !== expectedUrl
  ) {
    throw invalid("url_mismatch");
  }
  const issuedAt = requiredIssuedAt(claims.iat);
  assertFresh(issuedAt, input);
  if (input.accessToken !== undefined) {
    const expectedHash = await calculateDpopAccessTokenHash(input.accessToken);
    if (typeof claims.ath !== "string" || !equalText(claims.ath, expectedHash)) {
      throw invalid("token_hash_mismatch");
    }
  }
  return {
    jwkThumbprint: await calculateJwkThumbprint(jwk),
    proofId,
    issuedAt
  };
}

export async function calculateDpopAccessTokenHash(token: string): Promise<string> {
  return encodeBase64Url(new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(token)
  )));
}

export async function calculateJwkThumbprint(jwk: JWK): Promise<string> {
  const valid = validatePublicJwk(jwk);
  const canonical = JSON.stringify({
    crv: "P-256",
    kty: "EC",
    x: valid.x,
    y: valid.y
  });
  return encodeBase64Url(new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(canonical)
  )));
}

export async function calculateDpopKeyThumbprint(key: CryptoKey): Promise<string> {
  return calculateJwkThumbprint(await exportPublicJwk(key));
}

export function isDpopJwkThumbprint(value: unknown): value is string {
  return typeof value === "string" && jwkThumbprintPattern.test(value);
}

export function canonicalizeDpopUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid("url_mismatch");
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password
  ) {
    throw invalid("url_mismatch");
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

function decodeJson(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(decoder.decode(decodeBase64Url(value)));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Invalid proof parts share one safe protocol error.
  }
  throw invalid("malformed");
}

function encodeJson(value: unknown): string {
  return encodeBase64Url(encoder.encode(JSON.stringify(value)));
}

async function exportPublicJwk(key: CryptoKey): Promise<JWK> {
  if (key.type !== "public" || key.algorithm.name !== "ECDSA") {
    throw invalid("malformed");
  }
  return validatePublicJwk(await crypto.subtle.exportKey("jwk", key));
}

async function importVerificationKey(jwk: JWK): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
  } catch {
    throw invalid("malformed");
  }
}

function validatePublicJwk(value: unknown): JWK & {
  crv: "P-256";
  kty: "EC";
  x: string;
  y: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("malformed");
  }
  const jwk = value as Record<string, unknown>;
  if (
    jwk.kty !== "EC" ||
    jwk.crv !== "P-256" ||
    typeof jwk.x !== "string" ||
    typeof jwk.y !== "string" ||
    jwk.d !== undefined ||
    (jwk.alg !== undefined && jwk.alg !== supportedAlgorithm) ||
    !isCoordinate(jwk.x) ||
    !isCoordinate(jwk.y)
  ) {
    throw invalid("malformed");
  }
  return jwk as unknown as JWK & {
    crv: "P-256";
    kty: "EC";
    x: string;
    y: string;
  };
}

function isCoordinate(value: string): boolean {
  try {
    return decodeBase64Url(value).byteLength === 32;
  } catch {
    return false;
  }
}

function normalizeMethod(value: string): string {
  if (
    typeof value !== "string" ||
    !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value)
  ) {
    throw invalid("method_mismatch");
  }
  return value.toUpperCase();
}

function requiredProofId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > maximumDpopProofIdLength ||
    !proofIdPattern.test(value)
  ) {
    throw invalid("malformed");
  }
  return value;
}

function requiredIssuedAt(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw invalid("malformed");
  }
  return value;
}

function assertFresh(issuedAt: number, input: VerifyDpopProofInput): void {
  const now = (input.now ?? new Date()).getTime();
  const issuedAtMs = issuedAt * 1_000;
  if (
    issuedAtMs > now + input.clockSkewMs ||
    issuedAtMs <= now - input.proofTtlMs - input.clockSkewMs
  ) {
    throw invalid("expired");
  }
}

function equalText(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.byteLength !== rightBytes.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.byteLength; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function randomProofId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

function invalid(reason: DpopProofFailure): DpopProofValidationError {
  return new DpopProofValidationError(reason);
}
