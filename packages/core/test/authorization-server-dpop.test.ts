import { beforeAll, describe, expect, it } from "vitest";
import {
  createOwnAuth,
  createOwnAuthAuthorizationServerHandler,
  InMemoryAuthStorage
} from "../src/index.js";
import { createDpopProofJwt } from "../src/dpop-crypto.js";
import {
  createDpopProof,
  generateDpopKeyPair,
  type DpopKeyPair
} from "../src/dpop.js";
import { createOwnAuthProtectedResource } from "../src/protected-resource.js";
import { createAuthorizationFormRequest, createSigningPrivateKey } from "./helpers/authorization-server.js";
import { pkceChallenge } from "./helpers/pkce.js";

const issuer = "http://localhost";
const formRequest = createAuthorizationFormRequest(issuer);
const redirectUri = "https://client.example.com/callback";
const resourceIdentifier = "https://api.example.com/";
const protectedRequestUrl = "https://api.example.com/documents?draft=true";
const codeVerifier = "v".repeat(43);
let signingPrivateKey = "";

beforeAll(async () => {
  signingPrivateKey = await createSigningPrivateKey();
});

describe("DPoP-bound authorization-server tokens", () => {
  it("checks the proof before consuming the code and preserves the key on refresh", async () => {
    const harness = createHarness();
    const keyPair = await generateDpopKeyPair();
    const wrongKeyPair = await generateDpopKeyPair();
    const setup = await createBoundFlow(harness, keyPair);
    await expect(harness.auth.authorizationServer.metadata()).resolves.toMatchObject({
      dpop_signing_alg_values_supported: ["ES256"]
    });
    const missingProof = await exchangeCode(harness.handler, {
      clientId: setup.clientId,
      code: setup.code,
      resource: resourceIdentifier
    });
    expect(missingProof.status).toBe(400);
    await expect(missingProof.json()).resolves.toMatchObject({
      error: "invalid_dpop_proof"
    });
    const tokenProof = await createDpopProof({
      keyPair,
      method: "POST",
      url: `${issuer}/oauth/token`
    });
    const tokenResponse = await exchangeCode(harness.handler, {
      clientId: setup.clientId,
      code: setup.code,
      resource: resourceIdentifier,
      dpopProof: tokenProof
    });
    expect(tokenResponse.status).toBe(200);
    const tokens = await tokenResponse.json() as DpopTokenResponse;
    expect(tokens).toMatchObject({ token_type: "DPoP" });
    expect(tokens.refresh_token).toMatch(/^oa_rt_/);
    await expect(harness.auth.authorizationServer.verifyAccessToken({
      accessToken: tokens.access_token,
      resource: resourceIdentifier
    })).rejects.toMatchObject({ code: "invalid_token" });
    const wrongRefreshProof = await createDpopProof({
      keyPair: wrongKeyPair,
      method: "POST",
      url: `${issuer}/oauth/token`
    });
    const wrongRefresh = await refreshToken(harness.handler, {
      clientId: setup.clientId,
      refreshToken: tokens.refresh_token,
      resource: resourceIdentifier,
      dpopProof: wrongRefreshProof
    });
    expect(wrongRefresh.status).toBe(400);
    await expect(wrongRefresh.json()).resolves.toMatchObject({
      error: "invalid_dpop_proof"
    });
    const refreshProof = await createDpopProof({
      keyPair,
      method: "POST",
      url: `${issuer}/oauth/token`
    });
    const refreshed = await refreshToken(harness.handler, {
      clientId: setup.clientId,
      refreshToken: tokens.refresh_token,
      resource: resourceIdentifier,
      dpopProof: refreshProof
    });
    expect(refreshed.status).toBe(200);
    const refreshedTokens = await refreshed.json() as DpopTokenResponse;
    expect(refreshedTokens.token_type).toBe("DPoP");
    const revocationProof = await createDpopProof({
      keyPair,
      method: "POST",
      url: `${issuer}/oauth/revoke`
    });
    const revoked = await harness.handler(formRequest("/oauth/revoke", {
      client_id: setup.clientId,
      token: refreshedTokens.refresh_token
    }, revocationProof));
    expect(revoked.status).toBe(200);
    await expect(harness.auth.authorizationServer.listUserGrants({
      actorUserId: setup.userId
    })).resolves.toEqual([]);
  });

  it("validates ath before consuming a proof ID", async () => {
    const harness = createHarness();
    const keyPair = await generateDpopKeyPair();
    const setup = await createBoundFlow(harness, keyPair);
    const tokens = await exchangeBoundCode(harness.handler, setup, keyPair);
    const proofId = "ath-before-replay-consumption";
    const wrongProof = await createDpopProofJwt({
      keyPair,
      method: "GET",
      url: `${issuer}/oauth/userinfo`,
      accessToken: "oa_at_wrong",
      proofId
    });
    const rejected = await userInfo(harness.handler, tokens.access_token, wrongProof);
    expect(rejected.status).toBe(401);
    await expect(rejected.json()).resolves.toMatchObject({
      error: "invalid_dpop_proof"
    });

    const validProof = await createDpopProofJwt({
      keyPair,
      method: "GET",
      url: `${issuer}/oauth/userinfo`,
      accessToken: tokens.access_token,
      proofId
    });
    const accepted = await userInfo(harness.handler, tokens.access_token, validProof);
    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toMatchObject({
      sub: expect.stringMatching(/^oa_sub_/)
    });

    const replayed = await userInfo(harness.handler, tokens.access_token, validProof);
    expect(replayed.status).toBe(401);
    await expect(replayed.json()).resolves.toMatchObject({
      error: "invalid_dpop_proof"
    });
  });

  it("stores only a peppered replay hash", async () => {
    const storage = new InMemoryAuthStorage();
    const dpopStorage = storage.authorizationServerStorage.dpopStorage;
    const consume = dpopStorage.consumeDpopProof.bind(dpopStorage);
    let stored: { proofHash: string; consumedAt: Date; expiresAt: Date } | null = null;
    dpopStorage.consumeDpopProof = async (input) => {
      stored = input;
      return consume(input);
    };
    const harness = createHarness(true, storage);
    const keyPair = await generateDpopKeyPair();
    const setup = await createBoundFlow(harness, keyPair);
    const proofId = "proof-id-must-not-be-stored";
    const proof = await createDpopProofJwt({
      keyPair,
      method: "POST",
      url: `${issuer}/oauth/token`,
      proofId,
      issuedAt: Math.floor(Date.now() / 1_000) + 30
    });
    const response = await exchangeCode(harness.handler, {
      clientId: setup.clientId,
      code: setup.code,
      resource: resourceIdentifier,
      dpopProof: proof
    });
    expect(response.status).toBe(200);
    expect(stored?.proofHash).not.toContain(proof);
    expect(stored?.proofHash).not.toContain(proofId);
    expect(stored?.proofHash).not.toContain(keyPair.jwkThumbprint);
    expect((stored?.expiresAt.getTime() ?? 0) - (stored?.consumedAt.getTime() ?? 0))
      .toBeGreaterThan(6 * 60 * 1_000);
  });
  it("verifies a protected-resource request in one introspection round trip", async () => {
    const harness = createHarness();
    const keyPair = await generateDpopKeyPair();
    const setup = await createBoundFlow(harness, keyPair);
    const tokens = await exchangeBoundCode(harness.handler, setup, keyPair);
    let introspectionRequests = 0;
    const resource = createOwnAuthProtectedResource({
      introspectionUrl: `${issuer}/oauth/introspect`,
      resource: resourceIdentifier,
      resourceSecret: setup.resourceSecret,
      fetch: (input, init) => {
        introspectionRequests += 1;
        return harness.handler(new Request(input, init));
      }
    });
    const proof = await createDpopProof({
      keyPair,
      method: "GET",
      url: protectedRequestUrl,
      accessToken: tokens.access_token
    });

    await expect(resource.verifyRequest({
      authorization: `DPoP ${tokens.access_token}`,
      dpopProof: proof,
      method: "GET",
      url: protectedRequestUrl,
      requiredScopes: ["documents:read"]
    })).resolves.toMatchObject({
      active: true,
      tokenType: "DPoP",
      dpopJkt: keyPair.jwkThumbprint
    });
    expect(introspectionRequests).toBe(1);

    await expect(resource.verifyRequest({
      authorization: `DPoP ${tokens.access_token}`,
      dpopProof: proof,
      method: "GET",
      url: protectedRequestUrl
    })).resolves.toEqual({ active: false, error: "invalid_dpop_proof" });
    expect(introspectionRequests).toBe(2);

    await expect(resource.verifyRequest({
      authorization: `Bearer ${tokens.access_token}`,
      method: "GET",
      url: protectedRequestUrl
    })).resolves.toEqual({ active: false, error: "invalid_dpop_proof" });
    expect(resource.createDpopChallenge({ error: "invalid_dpop_proof" }))
      .toContain('DPoP error="invalid_dpop_proof"');
  });

  it("requires dpop_jkt for clients configured to issue bound tokens", async () => {
    const harness = createHarness();
    const signup = await harness.auth.signUpEmailPassword({
      email: "required@example.com",
      password: "correct-horse"
    });
    const { client } = await harness.auth.authorizationServer.createClient({
      name: "Required DPoP client",
      clientType: "public",
      applicationType: "web",
      redirectUris: [redirectUri],
      allowedScopes: ["openid"],
      dpopBoundAccessTokens: true
    });
    const response = await startAuthorization(harness.handler, {
      clientId: client.clientId,
      sessionToken: signup.sessionToken,
      scopes: ["openid"]
    });

    expect(response.status).toBe(302);
    const redirect = new URL(response.headers.get("location") ?? "");
    expect(redirect.origin + redirect.pathname).toBe(redirectUri);
    expect(redirect.searchParams.get("error")).toBe("invalid_request");
  });

  it("keeps unknown-token revocation non-disclosing without consuming the proof", async () => {
    const harness = createHarness();
    const keyPair = await generateDpopKeyPair();
    const setup = await createBoundFlow(harness, keyPair);
    const tokens = await exchangeBoundCode(harness.handler, setup, keyPair);
    const proof = await createDpopProof({
      keyPair,
      method: "POST",
      url: `${issuer}/oauth/revoke`
    });
    const revoke = (token: string) => harness.handler(formRequest("/oauth/revoke", {
      client_id: setup.clientId,
      token
    }, proof));

    await expect(revoke("oa_at_unknown")).resolves.toMatchObject({ status: 200 });
    await expect(revoke(tokens.access_token)).resolves.toMatchObject({ status: 200 });
  });

  it("rejects DPoP input when the authorization server has not enabled DPoP", async () => {
    const harness = createHarness(false);
    const signup = await harness.auth.signUpEmailPassword({
      email: "disabled@example.com",
      password: "correct-horse"
    });
    const { client } = await harness.auth.authorizationServer.createClient({
      name: "Bearer client",
      clientType: "public",
      applicationType: "web",
      redirectUris: [redirectUri],
      allowedScopes: ["openid"]
    });
    const code = await authorize(harness, {
      clientId: client.clientId,
      sessionToken: signup.sessionToken,
      scopes: ["openid"]
    });
    const rejected = await exchangeCode(harness.handler, {
      clientId: client.clientId,
      code,
      dpopProof: "not-a-proof"
    });
    expect(rejected.status).toBe(400);
    await expect(rejected.json()).resolves.toMatchObject({
      error: "invalid_request"
    });

    const accepted = await exchangeCode(harness.handler, {
      clientId: client.clientId,
      code
    });
    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toMatchObject({ token_type: "Bearer" });
  });
});

function createHarness(
  dpop = true,
  storage = new InMemoryAuthStorage()
) {
  const auth = createOwnAuth({
    storage,
    tokenPepper: "dpop-authorization-server-test-pepper",
    encryption: {
      current: { id: "test-key", key: new Uint8Array(32).fill(7) }
    },
    authorizationServer: {
      issuer,
      interactionUrl: `${issuer}/authorize/interaction`,
      signingKeys: {
        current: { id: "signing-key", privateKey: signingPrivateKey }
      },
      scopes: {
        "documents:read": { label: "Read documents" }
      },
      ...(dpop ? { dpop: {} } : {})
    }
  });
  return {
    auth,
    handler: createOwnAuthAuthorizationServerHandler(auth, {
      getRequestContext: () => ({ ipAddress: "203.0.113.20" })
    })
  };
}

async function createBoundFlow(
  harness: ReturnType<typeof createHarness>,
  keyPair: DpopKeyPair
) {
  const signup = await harness.auth.signUpEmailPassword({
    email: "dpop@example.com",
    password: "correct-horse"
  });
  const resource = await harness.auth.authorizationServer.createProtectedResource({
    identifier: resourceIdentifier,
    name: "Example API",
    allowedScopes: ["openid", "documents:read", "offline_access"],
    requireDpop: true
  });
  const { client } = await harness.auth.authorizationServer.createClient({
    name: "DPoP client",
    clientType: "public",
    applicationType: "web",
    redirectUris: [redirectUri],
    allowedScopes: ["openid", "documents:read", "offline_access"],
    dpopBoundAccessTokens: true
  });
  const code = await authorize(harness, {
    clientId: client.clientId,
    sessionToken: signup.sessionToken,
    scopes: ["openid", "documents:read", "offline_access"],
    resource: resourceIdentifier,
    dpopJkt: keyPair.jwkThumbprint
  });
  return {
    clientId: client.clientId,
    code,
    resourceSecret: resource.resourceSecret,
    userId: signup.user.id
  };
}

async function exchangeBoundCode(
  handler: ReturnType<typeof createOwnAuthAuthorizationServerHandler>,
  setup: { clientId: string; code: string },
  keyPair: DpopKeyPair
): Promise<DpopTokenResponse> {
  const proof = await createDpopProof({
    keyPair,
    method: "POST",
    url: `${issuer}/oauth/token`
  });
  const response = await exchangeCode(handler, {
    clientId: setup.clientId,
    code: setup.code,
    resource: resourceIdentifier,
    dpopProof: proof
  });
  expect(response.status).toBe(200);
  return response.json() as Promise<DpopTokenResponse>;
}

interface DpopTokenResponse {
  token_type: "DPoP";
  access_token: string;
  refresh_token: string;
}

interface AuthorizationInput {
  clientId: string;
  sessionToken: string;
  scopes: string[];
  resource?: string;
  dpopJkt?: string;
}

async function authorize(
  harness: ReturnType<typeof createHarness>,
  input: AuthorizationInput
): Promise<string> {
  const started = await startAuthorization(harness.handler, input);
  const location = new URL(started.headers.get("location") ?? "");
  const interactionToken = location.searchParams.get("interaction") ?? "";
  const approved = await harness.auth.authorizationServer.approveInteraction({
    interactionToken,
    sessionToken: input.sessionToken,
    approvedScopes: input.scopes
  });
  return new URL(approved.redirectUrl).searchParams.get("code") ?? "";
}

async function startAuthorization(
  handler: ReturnType<typeof createOwnAuthAuthorizationServerHandler>,
  input: AuthorizationInput
): Promise<Response> {
  const url = new URL(`${issuer}/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", input.scopes.join(" "));
  url.searchParams.set("state", "state-value");
  url.searchParams.set("code_challenge", await pkceChallenge(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  if (input.resource) url.searchParams.set("resource", input.resource);
  if (input.dpopJkt) url.searchParams.set("dpop_jkt", input.dpopJkt);
  return handler(new Request(url, {
    headers: { cookie: `own_auth_session=${input.sessionToken}` }
  }));
}

function exchangeCode(
  handler: ReturnType<typeof createOwnAuthAuthorizationServerHandler>,
  input: {
    clientId: string;
    code: string;
    resource?: string;
    dpopProof?: string;
  }
): Promise<Response> {
  return handler(formRequest("/oauth/token", {
    grant_type: "authorization_code",
    client_id: input.clientId,
    code: input.code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    ...(input.resource ? { resource: input.resource } : {})
  }, input.dpopProof));
}

function refreshToken(
  handler: ReturnType<typeof createOwnAuthAuthorizationServerHandler>,
  input: {
    clientId: string;
    refreshToken: string;
    resource?: string;
    dpopProof?: string;
  }
): Promise<Response> {
  return handler(formRequest("/oauth/token", {
    grant_type: "refresh_token",
    client_id: input.clientId,
    refresh_token: input.refreshToken,
    ...(input.resource ? { resource: input.resource } : {})
  }, input.dpopProof));
}

function userInfo(
  handler: ReturnType<typeof createOwnAuthAuthorizationServerHandler>,
  accessToken: string,
  dpopProof: string
): Promise<Response> {
  return handler(new Request(`${issuer}/oauth/userinfo`, {
    headers: {
      authorization: `DPoP ${accessToken}`,
      dpop: dpopProof
    }
  }));
}
