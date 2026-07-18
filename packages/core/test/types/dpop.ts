import { createOwnAuth, InMemoryAuthStorage } from "../../src/index.js";
import {
  createDpopProof,
  generateDpopKeyPair,
  type CreateDpopProofInput,
  type DpopKeyPair
} from "../../src/dpop.js";
import { createOwnAuthProtectedResource } from "../../src/protected-resource.js";

export const dpopAuth = createOwnAuth({
  storage: new InMemoryAuthStorage(),
  tokenPepper: "dpop-type-test-pepper",
  encryption: {
    current: { id: "type-test", key: new Uint8Array(32) }
  },
  authorizationServer: {
    issuer: "https://auth.example.com",
    interactionUrl: "https://auth.example.com/authorize",
    signingKeys: {
      current: {
        id: "type-test",
        privateKey: "-----BEGIN PRIVATE KEY-----\nplaceholder\n-----END PRIVATE KEY-----"
      }
    },
    dpop: {
      proofTtlMs: 5 * 60 * 1_000,
      clockSkewMs: 60 * 1_000
    }
  }
});

dpopAuth.authorizationServer.createClient({
  name: "DPoP client",
  clientType: "public",
  applicationType: "native",
  redirectUris: ["com.example.app:/oauth/callback"],
  dpopBoundAccessTokens: true
});

dpopAuth.authorizationServer.createProtectedResource({
  identifier: "https://api.example.com/",
  name: "Example API",
  allowedScopes: ["documents:read"],
  requireDpop: true
});

export const protectedResource = createOwnAuthProtectedResource({
  introspectionUrl: "https://auth.example.com/oauth/introspect",
  resource: "https://api.example.com/",
  resourceSecret: "oa_rs_example_secret"
});

protectedResource.verifyRequest({
  authorization: "DPoP oa_at_example",
  dpopProof: "header.payload.signature",
  method: "GET",
  url: "https://api.example.com/documents",
  requiredScopes: ["documents:read"]
});

declare const proofInput: CreateDpopProofInput;
export const dpopProof: Promise<string> = createDpopProof(proofInput);
export const dpopKeyPair: Promise<DpopKeyPair> = generateDpopKeyPair();

// @ts-expect-error DPoP proof lifetimes must be numeric milliseconds.
dpopAuth.authorizationServer.cleanupDpopProofs({ expiredBefore: "tomorrow" });
