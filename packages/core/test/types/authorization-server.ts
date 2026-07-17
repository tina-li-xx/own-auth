import {
  createOwnAuth,
  InMemoryAuthStorage,
  type AuthorizationInteractionAction,
  type TokenEndpointAuthMethod
} from "../../src/index.js";
import { createOwnAuthProtectedResource } from "../../src/protected-resource.js";

export const authWithAuthorizationServer = createOwnAuth({
  storage: new InMemoryAuthStorage(),
  tokenPepper: "authorization-server-type-test-pepper",
  encryption: {
    current: {
      id: "type-test",
      key: new Uint8Array(32)
    }
  },
  authorizationServer: {
    issuer: "https://auth.example.com",
    interactionUrl: "https://auth.example.com/authorize",
    signingKeys: {
      current: {
        id: "type-test",
        privateKey: "-----BEGIN PRIVATE KEY-----\nplaceholder\n-----END PRIVATE KEY-----"
      }
    }
  }
});

authWithAuthorizationServer.authorizationServer.createClient({
  name: "Browser client",
  clientType: "public",
  applicationType: "web",
  redirectUris: ["https://client.example.com/callback"],
  tokenEndpointAuthMethod: "none"
});

authWithAuthorizationServer.authorizationServer.verifyAccessToken({
  accessToken: "oa_at_example",
  requiredScopes: ["documents:read"],
  resource: "https://api.example.com/"
});

authWithAuthorizationServer.authorizationServer.createProtectedResource({
  identifier: "https://api.example.com/",
  name: "Example API",
  allowedScopes: ["documents:read"]
});

export const protectedResource = createOwnAuthProtectedResource({
  introspectionUrl: "https://auth.example.com/oauth/introspect",
  resource: "https://api.example.com/",
  resourceSecret: "oa_rs_example_secret"
});

export const clientAuthMethod: TokenEndpointAuthMethod = "client_secret_basic";
export const interactionAction: AuthorizationInteractionAction = "select_account";

// @ts-expect-error Authorization clients support only the documented auth methods.
export const invalidClientAuthMethod: TokenEndpointAuthMethod = "private_key_jwt";

// @ts-expect-error Interaction actions are a closed union.
export const invalidInteractionAction: AuthorizationInteractionAction = "approve";
