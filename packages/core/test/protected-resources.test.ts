import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createOwnAuth,
  createOwnAuthAuthorizationServerHandler,
  InMemoryAuthStorage,
  type AuthorizationServerCapableStorage
} from "../src/index.js";
import { createOwnAuthProtectedResource } from "../src/protected-resource.js";

const issuer = "http://localhost";
const redirectUri = "https://client.example.com/callback";
const resourceIdentifier = "https://api.example.com/";
const codeVerifier = "v".repeat(43);
let signingPrivateKey = "";

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  signingPrivateKey = await exportPKCS8(privateKey);
});

describe("OAuth protected resources", () => {
  it("binds access tokens to one registered resource", async () => {
    const harness = createHarness();
    const signup = await createUser(harness.auth, "resource@example.com");
    const created = await createResource(harness.auth, resourceIdentifier);
    const client = await createClient(harness.auth);
    const token = await issueAccessToken(harness, {
      clientId: client.clientId,
      sessionToken: signup.sessionToken,
      scopes: ["documents:read"],
      resource: resourceIdentifier
    });

    const remote = resourceClient(harness.handler, created.resourceSecret);
    await expect(remote.verifyAccessToken({
      accessToken: token,
      requiredScopes: ["documents:read"]
    })).resolves.toMatchObject({
      active: true,
      resource: resourceIdentifier,
      scopes: ["documents:read"]
    });
    await expect(harness.auth.authorizationServer.verifyAccessToken({
      accessToken: token
    })).rejects.toMatchObject({ code: "invalid_token" });
    await expect(harness.auth.authorizationServer.verifyAccessToken({
      accessToken: token,
      resource: resourceIdentifier
    })).resolves.toMatchObject({ resource: resourceIdentifier });

    const other = await createResource(harness.auth, "https://other.example.com/");
    const otherClient = resourceClient(
      harness.handler,
      other.resourceSecret,
      other.resource.identifier
    );
    await expect(otherClient.verifyAccessToken({ accessToken: token })).resolves.toEqual({
      active: false,
      error: "invalid_token"
    });

    const storage = (harness.auth.storage as AuthorizationServerCapableStorage)
      .authorizationServerStorage;
    const prefix = created.resourceSecret.slice(0, created.resourceSecret.lastIndexOf("_"));
    const stored = await storage.getProtectedResourceSecretByPrefix(
      created.resource.id,
      prefix
    );
    expect(stored?.secretHash).not.toBe(created.resourceSecret);
    await expect(harness.auth.authorizationServer.listProtectedResources())
      .resolves.toHaveLength(2);
  });

  it("does not let an unbound grant gain or switch resources", async () => {
    const harness = createHarness();
    const signup = await createUser(harness.auth, "unbound@example.com");
    const firstResource = await createResource(harness.auth, resourceIdentifier);
    const secondResource = await createResource(
      harness.auth,
      "https://secondary.example.com/"
    );
    const client = await createClient(harness.auth);
    const unbound = await issueTokens(harness, {
      clientId: client.clientId,
      sessionToken: signup.sessionToken,
      scopes: ["documents:read", "offline_access"]
    });

    await expect(harness.auth.authorizationServer.verifyAccessToken({
      accessToken: unbound.access_token,
      resource: firstResource.resource.identifier
    })).rejects.toMatchObject({ code: "invalid_token" });
    await expect(resourceClient(
      harness.handler,
      firstResource.resourceSecret
    ).verifyAccessToken({ accessToken: unbound.access_token })).resolves.toEqual({
      active: false,
      error: "invalid_token"
    });

    const refreshResponse = await harness.handler(formRequest("/oauth/token", {
      grant_type: "refresh_token",
      client_id: client.clientId,
      refresh_token: unbound.refresh_token ?? "",
      resource: firstResource.resource.identifier
    }));
    expect(refreshResponse.status).toBe(400);
    await expect(refreshResponse.json()).resolves.toMatchObject({ error: "invalid_target" });

    const code = await authorize(harness, {
      clientId: client.clientId,
      sessionToken: signup.sessionToken,
      scopes: ["documents:read"],
      resource: firstResource.resource.identifier
    });
    const exchangeResponse = await exchangeCode(
      harness.handler,
      client.clientId,
      code,
      secondResource.resource.identifier
    );
    expect(exchangeResponse.status).toBe(400);
    await expect(exchangeResponse.json()).resolves.toMatchObject({ error: "invalid_grant" });
  });

  it("invalidates the whole token only when that token carries a removed scope", async () => {
    const harness = createHarness();
    const signup = await createUser(harness.auth, "scopes@example.com");
    const resource = await createResource(harness.auth, resourceIdentifier);
    const client = await createClient(harness.auth);
    const readOnly = await issueAccessToken(harness, {
      clientId: client.clientId,
      sessionToken: signup.sessionToken,
      scopes: ["documents:read"],
      resource: resourceIdentifier
    });
    const readWrite = await issueAccessToken(harness, {
      clientId: client.clientId,
      sessionToken: signup.sessionToken,
      scopes: ["documents:read", "documents:write"],
      resource: resourceIdentifier
    });
    const remote = resourceClient(harness.handler, resource.resourceSecret);

    await harness.auth.authorizationServer.updateProtectedResource({
      identifier: resourceIdentifier,
      allowedScopes: ["documents:read"]
    });
    await expect(remote.verifyAccessToken({ accessToken: readOnly }))
      .resolves.toMatchObject({ active: true, scopes: ["documents:read"] });
    await expect(remote.verifyAccessToken({ accessToken: readWrite })).resolves.toEqual({
      active: false,
      error: "invalid_token"
    });
    await expect(harness.auth.authorizationServer.listUserGrants({
      actorUserId: signup.user.id
    })).resolves.toMatchObject([{
      grant: { scopes: ["documents:read"], revokedAt: null }
    }]);

    await harness.auth.authorizationServer.updateProtectedResource({
      identifier: resourceIdentifier,
      allowedScopes: ["documents:read", "documents:write"]
    });
    await expect(remote.verifyAccessToken({ accessToken: readWrite })).resolves.toEqual({
      active: false,
      error: "invalid_token"
    });
  });

  it("rejects an open interaction after the resource removes a requested scope", async () => {
    const harness = createHarness();
    const signup = await createUser(harness.auth, "stale-consent@example.com");
    await createResource(harness.auth, resourceIdentifier);
    const client = await createClient(harness.auth);
    const started = await startAuthorization(harness, {
      clientId: client.clientId,
      sessionToken: signup.sessionToken,
      scopes: ["documents:read", "documents:write"],
      resource: resourceIdentifier
    });
    const interactionToken = new URL(started.headers.get("location") ?? "")
      .searchParams.get("interaction") ?? "";

    await harness.auth.authorizationServer.updateProtectedResource({
      identifier: resourceIdentifier,
      allowedScopes: ["documents:read"]
    });

    await expect(harness.auth.authorizationServer.approveInteraction({
      interactionToken,
      sessionToken: signup.sessionToken,
      approvedScopes: ["documents:read", "documents:write"]
    })).rejects.toMatchObject({ code: "authorization_interaction_invalid" });
    await expect(harness.auth.authorizationServer.listUserGrants({
      actorUserId: signup.user.id
    })).resolves.toEqual([]);
  });

  it("rotates credentials and permanently reserves revoked identifiers", async () => {
    const harness = createHarness();
    const created = await createResource(harness.auth, resourceIdentifier);
    const rotatedSecret = await harness.auth.authorizationServer
      .rotateProtectedResourceSecret({ identifier: resourceIdentifier });
    const oldClient = resourceClient(harness.handler, created.resourceSecret);
    await expect(oldClient.verifyAccessToken({ accessToken: "oa_at_unknown" }))
      .rejects.toMatchObject({ code: "resource_authentication_failed" });
    await expect(resourceClient(harness.handler, rotatedSecret).verifyAccessToken({
      accessToken: "oa_at_unknown"
    })).resolves.toEqual({ active: false, error: "invalid_token" });

    await harness.auth.authorizationServer.revokeProtectedResource({
      identifier: resourceIdentifier
    });
    await expect(resourceClient(harness.handler, rotatedSecret).verifyAccessToken({
      accessToken: "oa_at_unknown"
    })).rejects.toMatchObject({ code: "resource_authentication_failed" });
    await expect(createResource(harness.auth, resourceIdentifier)).rejects.toMatchObject({
      code: "protected_resource_identifier_unavailable"
    });
  });

  it("shares introspection limits per resource and failed-auth limits per IP", async () => {
    const harness = createHarness({
      resourceIntrospectionRequestsPerMinute: 1,
      failedIntrospectionAttemptsPerMinute: 1
    });
    const created = await createResource(harness.auth, resourceIdentifier);
    const first = resourceClient(harness.handler, created.resourceSecret);
    const second = resourceClient(harness.handler, created.resourceSecret);

    await expect(first.verifyAccessToken({ accessToken: "oa_at_unknown" }))
      .resolves.toMatchObject({ active: false });
    await expect(second.verifyAccessToken({ accessToken: "oa_at_unknown" }))
      .rejects.toMatchObject({ code: "introspection_rate_limited" });

    const wrongSecret = `${created.resourceSecret.slice(0, -1)}${
      created.resourceSecret.endsWith("a") ? "b" : "a"
    }`;
    const invalid = resourceClient(harness.handler, wrongSecret);
    await expect(invalid.verifyAccessToken({ accessToken: "oa_at_unknown" }))
      .rejects.toMatchObject({ code: "resource_authentication_failed" });
    await expect(invalid.verifyAccessToken({ accessToken: "oa_at_unknown" }))
      .rejects.toMatchObject({ code: "introspection_rate_limited" });
  });
});

function createHarness(limits: {
  resourceIntrospectionRequestsPerMinute?: number;
  failedIntrospectionAttemptsPerMinute?: number;
} = {}) {
  const auth = createOwnAuth({
    storage: new InMemoryAuthStorage(),
    tokenPepper: "protected-resource-test-pepper",
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
        "documents:read": { label: "Read documents" },
        "documents:write": { label: "Write documents" }
      },
      ...limits
    }
  });
  return {
    auth,
    handler: createOwnAuthAuthorizationServerHandler(auth, {
      getRequestContext: () => ({ ipAddress: "203.0.113.10" })
    })
  };
}

async function createUser(auth: ReturnType<typeof createOwnAuth>, email: string) {
  return auth.signUpEmailPassword({ email, password: "correct-horse" });
}

async function createResource(
  auth: ReturnType<typeof createOwnAuth>,
  identifier: string
) {
  return auth.authorizationServer.createProtectedResource({
    identifier,
    name: new URL(identifier).hostname,
    allowedScopes: ["documents:read", "documents:write", "offline_access"]
  });
}

async function createClient(auth: ReturnType<typeof createOwnAuth>) {
  return (await auth.authorizationServer.createClient({
    name: "Protected resource client",
    clientType: "public",
    applicationType: "web",
    redirectUris: [redirectUri],
    allowedScopes: ["documents:read", "documents:write", "offline_access"]
  })).client;
}

function resourceClient(
  handler: ReturnType<typeof createOwnAuthAuthorizationServerHandler>,
  resourceSecret: string,
  resource = resourceIdentifier
) {
  return createOwnAuthProtectedResource({
    introspectionUrl: `${issuer}/oauth/introspect`,
    resource,
    resourceSecret,
    fetch: (input, init) => handler(new Request(input, init))
  });
}

async function issueAccessToken(
  harness: ReturnType<typeof createHarness>,
  input: AuthorizationInput
): Promise<string> {
  return (await issueTokens(harness, input)).access_token;
}

async function issueTokens(
  harness: ReturnType<typeof createHarness>,
  input: AuthorizationInput
): Promise<{ access_token: string; refresh_token?: string }> {
  const code = await authorize(harness, input);
  const response = await exchangeCode(harness.handler, input.clientId, code);
  expect(response.status).toBe(200);
  return response.json() as Promise<{ access_token: string; refresh_token?: string }>;
}

interface AuthorizationInput {
  clientId: string;
  sessionToken: string;
  scopes: string[];
  resource?: string;
}

async function authorize(
  harness: ReturnType<typeof createHarness>,
  input: AuthorizationInput
): Promise<string> {
  const started = await startAuthorization(harness, input);
  const location = new URL(started.headers.get("location") ?? "");
  const immediateCode = location.searchParams.get("code");
  if (immediateCode) return immediateCode;
  const interactionToken = location.searchParams.get("interaction") ?? "";
  const approved = await harness.auth.authorizationServer.approveInteraction({
    interactionToken,
    sessionToken: input.sessionToken,
    approvedScopes: input.scopes
  });
  return new URL(approved.redirectUrl).searchParams.get("code") ?? "";
}

async function startAuthorization(
  harness: ReturnType<typeof createHarness>,
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
  return harness.handler(new Request(url, {
    headers: { cookie: `own_auth_session=${input.sessionToken}` }
  }));
}

function exchangeCode(
  handler: ReturnType<typeof createOwnAuthAuthorizationServerHandler>,
  clientId: string,
  code: string,
  resource?: string
): Promise<Response> {
  return handler(formRequest("/oauth/token", {
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    ...(resource ? { resource } : {})
  }));
}

function formRequest(path: string, values: Record<string, string>): Request {
  return new Request(`${issuer}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values)
  });
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  );
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}
