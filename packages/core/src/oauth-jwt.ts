import { AuthError } from "./errors.js";
import { decodeBase64Url } from "./encoding.js";

interface JwtHeader {
  alg?: string;
  kid?: string;
}

interface JsonWebKey {
  kid?: string;
  kty?: string;
  [key: string]: unknown;
}

export interface VerifiedJwtClaims {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
  [key: string]: unknown;
}

const jwksCache = new Map<string, { expiresAt: number; keys: JsonWebKey[] }>();

export async function verifyRs256Jwt(input: {
  token: string;
  jwksUri: string;
  issuer: string | readonly string[];
  audience: string;
  nonce?: string;
  fetch: typeof globalThis.fetch;
}): Promise<VerifiedJwtClaims> {
  const [encodedHeader, encodedPayload, encodedSignature, extra] = input.token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature || extra) {
    throw invalidProviderToken();
  }
  const header = parsePart<JwtHeader>(encodedHeader);
  const claims = parsePart<VerifiedJwtClaims>(encodedPayload);
  if (header.alg !== "RS256" || !header.kid) {
    throw invalidProviderToken();
  }
  let keys = await getJwks(input.jwksUri, input.fetch);
  let jwk = keys.find((candidate) => candidate.kid === header.kid && candidate.kty === "RSA");
  if (!jwk) {
    jwksCache.delete(input.jwksUri);
    keys = await getJwks(input.jwksUri, input.fetch);
    jwk = keys.find((candidate) => candidate.kid === header.kid && candidate.kty === "RSA");
    if (!jwk) throw invalidProviderToken();
  }
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeJwtPart(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );
  if (!valid) {
    throw invalidProviderToken();
  }
  validateClaims(claims, input);
  return claims;
}

async function getJwks(uri: string, fetchImpl: typeof globalThis.fetch): Promise<JsonWebKey[]> {
  const cached = jwksCache.get(uri);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.keys;
  }
  const response = await fetchImpl(uri, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new AuthError("oauth_provider_error", "OAuth provider verification failed", 502);
  }
  const body = await response.json() as { keys?: JsonWebKey[] };
  if (!Array.isArray(body.keys)) {
    throw invalidProviderToken();
  }
  const maxAge = parseMaxAge(response.headers.get("cache-control"));
  jwksCache.set(uri, { expiresAt: Date.now() + maxAge * 1000, keys: body.keys });
  return body.keys;
}

function validateClaims(
  claims: VerifiedJwtClaims,
  input: { issuer: string | readonly string[]; audience: string; nonce?: string }
): void {
  const issuers = typeof input.issuer === "string" ? [input.issuer] : input.issuer;
  const audiences = typeof claims.aud === "string" ? [claims.aud] : claims.aud;
  const now = Math.floor(Date.now() / 1000);
  if (
    !claims.sub ||
    !claims.iss ||
    !issuers.includes(claims.iss) ||
    !audiences?.includes(input.audience) ||
    typeof claims.exp !== "number" ||
    claims.exp <= now ||
    (input.nonce !== undefined && claims.nonce !== input.nonce)
  ) {
    throw invalidProviderToken();
  }
}

function parsePart<T>(value: string): T {
  try {
    return JSON.parse(new TextDecoder().decode(decodeJwtPart(value))) as T;
  } catch {
    throw invalidProviderToken();
  }
}

function decodeJwtPart(value: string): Uint8Array {
  try {
    return decodeBase64Url(value);
  } catch {
    throw invalidProviderToken();
  }
}

function parseMaxAge(cacheControl: string | null): number {
  const match = cacheControl?.match(/(?:^|,)\s*max-age=(\d+)/i);
  return match?.[1] ? Number(match[1]) : 300;
}

function invalidProviderToken(): AuthError {
  return new AuthError("oauth_provider_error", "OAuth provider identity is invalid", 401);
}
