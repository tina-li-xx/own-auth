import type { AuthEngineContext } from "./auth-engine-context.js";
import {
  authenticateAuthorizationClient,
  isActiveAuthorizationClient
} from "./authorization-server-clients.js";
import { getOrCreateOidcSubject } from "./authorization-server-claims.js";
import { authorizationServerTokenPrefixes } from "./authorization-server-constants.js";
import {
  epochSeconds,
  hashAuthorizationSecret,
  requireAuthorizationProtocolToken,
  requireAuthorizationServer
} from "./authorization-server-helpers.js";
import {
  authenticateProtectedResource,
  authorizationTokenScopesAreActive,
  isActiveProtectedResourceBinding
} from "./authorization-server-protected-resources.js";
import { AuthorizationProtocolError } from "./authorization-server-protocol-error.js";
import {
  rateLimitAuthorizationServerProtocol,
  rateLimitFailedProtectedResourceAuthentication,
  rateLimitProtectedResourceIntrospection
} from "./authorization-server-rate-limits.js";
import type {
  AuthorizationAccessToken,
  AuthorizationClient,
  AuthorizationIntrospectionResponse,
  AuthorizationRefreshToken,
  AuthorizationTokenActionInput,
  ProtectedResource
} from "./authorization-server-types.js";
import { isExpired } from "./normalise.js";

type IntrospectionPrincipal =
  | { kind: "client"; client: AuthorizationClient }
  | { kind: "resource"; resource: ProtectedResource };

export async function introspectAuthorizationToken(
  ctx: AuthEngineContext,
  input: AuthorizationTokenActionInput
): Promise<AuthorizationIntrospectionResponse> {
  const principal = await authenticateIntrospectionPrincipal(ctx, input);
  const rawToken = requireAuthorizationProtocolToken(input.token);
  const { storage } = requireAuthorizationServer(ctx);
  const tokenHash = hashAuthorizationSecret(ctx, rawToken);
  const [accessToken, refreshToken] = await Promise.all([
    storage.getAuthorizationAccessTokenByHash(tokenHash),
    storage.getAuthorizationRefreshTokenByHash(tokenHash)
  ]);
  const token = principal.kind === "resource"
    ? accessToken
    : accessToken ?? refreshToken;
  if (!token || !introspectionPrincipalOwnsToken(principal, token)) {
    return { active: false };
  }
  const [grant, user, client, resource] = await Promise.all([
    storage.getAuthorizationGrant(
      token.authorizationClientId,
      token.userId,
      token.protectedResourceId
    ),
    ctx.storage.getUserById(token.userId),
    storage.getAuthorizationClientById(token.authorizationClientId),
    token.protectedResourceId
      ? storage.getProtectedResourceById(token.protectedResourceId)
      : Promise.resolve(null)
  ]);
  if (
    !isActiveAuthorizationClient(client) ||
    !grant ||
    grant.id !== token.grantId ||
    grant.revokedAt ||
    token.revokedAt ||
    isExpired(token.expiresAt) ||
    !user ||
    user.disabledAt ||
    (token === refreshToken && Boolean(refreshToken.consumedAt)) ||
    !isActiveProtectedResourceBinding(token.protectedResourceId, resource) ||
    !authorizationTokenScopesAreActive(resource, grant.scopes, token.scopes)
  ) {
    return { active: false };
  }
  const subject = await getOrCreateOidcSubject(ctx, user.id);
  return {
    active: true,
    scope: token.scopes.join(" "),
    client_id: client.clientId,
    ...(accessToken ? { token_type: "Bearer" as const } : {}),
    exp: epochSeconds(token.expiresAt),
    iat: epochSeconds(token.createdAt),
    sub: subject.subject,
    ...(resource ? { aud: resource.identifier } : {})
  };
}

async function authenticateIntrospectionPrincipal(
  ctx: AuthEngineContext,
  input: AuthorizationTokenActionInput
): Promise<IntrospectionPrincipal> {
  if (input.clientId?.startsWith(authorizationServerTokenPrefixes.clientId)) {
    await rateLimitAuthorizationServerProtocol(ctx, "introspection", input);
    const client = await authenticateAuthorizationClient(ctx, input);
    if (client.clientType !== "confidential") {
      throw new AuthorizationProtocolError(
        "unauthorized_client",
        "Token introspection requires a confidential client",
        { statusCode: 403 }
      );
    }
    return { kind: "client", client };
  }

  let resource: ProtectedResource;
  try {
    if (input.clientAuthenticationMethod !== "client_secret_basic") {
      throw new AuthorizationProtocolError(
        "invalid_client",
        "Protected resources must use HTTP Basic authentication",
        { statusCode: 401 }
      );
    }
    resource = await authenticateProtectedResource(
      ctx,
      input.clientId,
      input.clientSecret
    );
  } catch (error) {
    if (error instanceof AuthorizationProtocolError && error.code === "invalid_client") {
      await rateLimitFailedProtectedResourceAuthentication(
        ctx,
        input.request?.ipAddress
      );
    }
    throw error;
  }

  await rateLimitProtectedResourceIntrospection(ctx, resource.id);
  return { kind: "resource", resource };
}

function introspectionPrincipalOwnsToken(
  principal: IntrospectionPrincipal,
  token: AuthorizationAccessToken | AuthorizationRefreshToken
): boolean {
  return principal.kind === "resource"
    ? token.protectedResourceId === principal.resource.id
    : token.authorizationClientId === principal.client.id;
}
