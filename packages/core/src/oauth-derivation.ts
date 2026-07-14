import { encodeBase64Url } from "./encoding.js";

const pkceLabel = "own-auth:oauth:pkce:v1";
const nonceLabel = "own-auth:oauth:nonce:v1";

/**
 * OAuth PKCE and nonce values are deterministic HMAC derivations of the raw
 * state. Only the state hash is persisted, so no second callback secret needs
 * to be stored. The domain labels keep the two derived values independent.
 */
export async function deriveOAuthSecrets(rawState: string): Promise<{
  codeVerifier: string;
  nonce: string;
}> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(rawState),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const [pkce, nonce] = await Promise.all([
    crypto.subtle.sign("HMAC", key, new TextEncoder().encode(pkceLabel)),
    crypto.subtle.sign("HMAC", key, new TextEncoder().encode(nonceLabel))
  ]);
  return {
    codeVerifier: encodeBase64Url(new Uint8Array(pkce)),
    nonce: encodeBase64Url(new Uint8Array(nonce))
  };
}
