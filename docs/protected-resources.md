# Protected Resources

Bind OAuth access tokens to one API and verify them from that API through remote introspection.

A protected resource is an API that accepts access tokens issued by the Own Auth authorization server. It can run in the same application as Own Auth or in a separate service. It never needs direct access to the Own Auth database, signing keys, or encryption keys.

## Run The Migration

```bash
npx own-auth migrate
```

Migration `012_protected_resources` adds registered resources, hashed resource secrets, and resource bindings for grants, authorization codes, access tokens, and refresh tokens. Migration `013_dpop` adds optional DPoP enforcement and proof replay protection.

## Register A Resource

Register resources from trusted server-side administration code:

```ts
const created = await auth.authorizationServer.createProtectedResource({
  identifier: "https://api.example.com/",
  name: "Documents API",
  allowedScopes: ["documents:read", "documents:write"],
  requireDpop: true,
});

console.log(created.resource.identifier);
console.log(created.resourceSecret);
```

Store `resourceSecret` immediately. It is shown once and only its hash and visible prefix are stored.

The identifier is the API's exact HTTPS URL. Localhost HTTP URLs are accepted for local development. Identifiers cannot contain credentials, query parameters, or fragments.

Resource identifiers are permanent. Revoking a resource keeps its identifier reserved so another resource cannot later receive tokens intended for the old API. If an identifier is wrong, revoke it and register the correct identifier.

## Request A Resource-Bound Token

The client includes one `resource` parameter in the authorization request. A DPoP flow also includes the public-key thumbprint in `dpop_jkt`:

```text
GET /oauth/authorize
  ?response_type=code
  &client_id=oa_client_...
  &redirect_uri=https%3A%2F%2Fclient.example.com%2Fcallback
  &scope=documents%3Aread
  &resource=https%3A%2F%2Fapi.example.com%2F
  &dpop_jkt=...
  &code_challenge=...
  &code_challenge_method=S256
```

Own Auth supports one resource per authorization flow. The requested scopes must be allowed by both the client and the resource.

The token exchange may omit `resource` and inherit it from the authorization code. If it includes `resource`, the value must match the code exactly. An authorization flow started without a resource cannot gain one during code exchange or refresh, and a refresh token cannot switch resources.

When the resource or client requires DPoP, `dpop_jkt` is required and the code exchange must include a valid `DPoP` proof header. See [OAuth And OpenID Connect Authorization Server](/docs/authorization-server#bind-tokens-with-dpop) for client key and proof creation.

## Verify In The Same Application

An API using the same Own Auth instance can verify a Bearer token directly:

```ts
const verified = await auth.authorizationServer.verifyAccessToken({
  accessToken,
  resource: "https://api.example.com/",
  requiredScopes: ["documents:read"],
});

console.log(verified.userId);
```

The resource must match exactly. A token for another resource, an unbound token, an expired token, a revoked token, or a token carrying a removed scope fails with `invalid_token`.

This direct method does not accept DPoP-bound tokens because it has no HTTP request method, URL, or proof to verify. Use the request helper below for DPoP, including when the API and authorization server run in the same application.

## Verify From Another Service

Use the lightweight `own-auth/protected-resource` export in a separate resource server:

```ts
import { createOwnAuthProtectedResource } from "own-auth/protected-resource";

const ownAuth = createOwnAuthProtectedResource({
  introspectionUrl: "https://auth.example.com/oauth/introspect",
  resource: "https://api.example.com/",
  resourceSecret: process.env.OWN_AUTH_RESOURCE_SECRET!,
});

const result = await ownAuth.verifyRequest({
  authorization: request.headers.get("authorization"),
  dpopProof: request.headers.get("dpop"),
  method: request.method,
  url: request.url,
  requiredScopes: ["documents:read"],
});

if (!result.active) {
  return new Response("Unauthorized", {
    status: result.error === "insufficient_scope" ? 403 : 401,
    headers: {
      "www-authenticate": ownAuth.createDpopChallenge({
        error: result.error,
        requiredScopes: result.requiredScopes,
      }),
    },
  });
}

console.log(result.subject);
```

For a Bearer-only API, `verifyAccessToken({ accessToken })` remains the shorter equivalent and `createBearerChallenge` creates its challenge header.

The request helper accepts `Authorization: DPoP <token>` plus the `DPoP` proof header. It forwards the proof, method, and canonical request URL in one authenticated introspection request. Own Auth verifies the proof signature, key thumbprint, method, URL, access-token hash, timestamp, and single-use proof ID.

The helper uses Web `fetch` and does not import the Own Auth core, Postgres, D1, or encryption code. Access tokens remain opaque. The resource server authenticates to introspection with its identifier and resource secret.

## Introspection Limits

Authenticated introspection allows 6,000 requests per minute per resource identity by default. Every server instance using the same resource identifier and credentials shares that limit.

Failed resource authentication allows 30 attempts per minute per IP address by default when the authorization-server handler receives an IP address through `getRequestContext`.

Change the limits when configuring the authorization server:

```ts
const auth = createOwnAuth({
  // ...
  authorizationServer: {
    // ...
    resourceIntrospectionRequestsPerMinute: 12_000,
    failedIntrospectionAttemptsPerMinute: 30,
  },
});
```

## Change Scopes

```ts
await auth.authorizationServer.updateProtectedResource({
  identifier: "https://api.example.com/",
  allowedScopes: ["documents:read"],
});
```

Removing a scope is deliberately destructive for tokens that carry it. A token granted `documents:read documents:write` becomes fully inactive when `documents:write` is removed. Introspection returns `{ "active": false }`; Own Auth does not strip the removed scope and keep the token active.

A token granted only `documents:read` continues working because all of its authority remains valid. Restoring a removed scope does not reactivate tokens that were invalidated.

## Rotate Or Revoke Credentials

Rotate the resource secret:

```ts
const resourceSecret = await auth.authorizationServer.rotateProtectedResourceSecret({
  identifier: "https://api.example.com/",
});
```

The previous secret stops authenticating immediately.

Revoke the resource:

```ts
await auth.authorizationServer.revokeProtectedResource({
  identifier: "https://api.example.com/",
});
```

Revocation invalidates the resource secrets, grants, access tokens, and refresh tokens. It does not release the identifier for reuse.

## List Resources

```ts
const resources = await auth.authorizationServer.listProtectedResources();
```

The returned records contain metadata and safe identifiers, never raw resource secrets.
