import type { AuthEngineContext } from "./auth-engine-context.js";
import { audit } from "./auth-engine-helpers.js";
import { authenticateAuthorizationClient } from "./authorization-server-clients.js";
import { createAuthorizationIdToken } from "./authorization-server-claims.js";
import { authorizationServerTokenPrefixes } from "./authorization-server-constants.js";
import {
  authorizationTokenPrefix,
  calculateCodeChallenge,
  createAccessToken,
  createRefreshToken,
  decryptAuthorizationNonce,
  hashAuthorizationSecret,
  normalizeProtectedResourceIdentifier,
  requireAuthorizationServer
} from "./authorization-server-helpers.js";
import {
  authorizationTokenScopesAreActive,
  isActiveProtectedResource
} from "./authorization-server-protected-resources.js";
import { AuthorizationProtocolError } from "./authorization-server-protocol-error.js";
import { rateLimitAuthorizationServerProtocol } from "./authorization-server-rate-limits.js";
import type {
  AuthorizationAccessToken,
  AuthorizationClient,
  AuthorizationRefreshToken,
  ProtectedResource,
  AuthorizationTokenRequestInput,
  AuthorizationTokenResponse
} from "./authorization-server-types.js";
import { createId } from "./crypto.js";
import { isExpired } from "./normalise.js";
import type { Session, User } from "./types.js";

export async function exchangeAuthorizationToken(
  ctx: AuthEngineContext,
  input: AuthorizationTokenRequestInput
): Promise<AuthorizationTokenResponse> {
  await rateLimitAuthorizationServerProtocol(ctx, "token", input);
  const client = await authenticateAuthorizationClient(ctx, input);
  if (!input.grantType) {
    throw new AuthorizationProtocolError("invalid_request", "grant_type is required");
  }
  if (input.grantType === "authorization_code") {
    return exchangeAuthorizationCode(ctx, client, input);
  }
  if (input.grantType === "refresh_token") {
    return exchangeRefreshToken(ctx, client, input);
  }
  throw new AuthorizationProtocolError(
    "unsupported_grant_type",
    "The requested grant type is not supported"
  );
}

async function exchangeAuthorizationCode(
  ctx: AuthEngineContext,
  client: AuthorizationClient,
  input: AuthorizationTokenRequestInput
): Promise<AuthorizationTokenResponse> {
  const { storage } = requireAuthorizationServer(ctx);
  const rawCode = requiredToken(
    input.code,
    "code",
    authorizationServerTokenPrefixes.authorizationCode
  );
  const redirectUri = requiredText(input.redirectUri, "redirect_uri");
  const codeVerifier = requiredText(input.codeVerifier, "code_verifier");
  const requestedResource = optionalResource(input.resource);
  const codeChallenge = await calculateCodeChallenge(codeVerifier);
  const code = await storage.consumeAuthorizationCode(
    hashAuthorizationSecret(ctx, rawCode),
    client.id,
    redirectUri,
    codeChallenge,
    requestedResource,
    new Date()
  );
  if (!code) throw invalidGrant();

  const [grant, user, sessions, resource] = await Promise.all([
    storage.getAuthorizationGrant(
      client.id,
      code.userId,
      code.protectedResourceId
    ),
    ctx.storage.getUserById(code.userId),
    ctx.storage.listSessionsByUserId(code.userId),
    loadTokenResource(ctx, code.protectedResourceId, requestedResource)
  ]);
  const session = sessions.find((candidate) => candidate.id === code.sessionId) ?? null;
  if (
    !grant ||
    grant.id !== code.grantId ||
    grant.revokedAt ||
    !user ||
    user.disabledAt ||
    !usableSession(session) ||
    !authorizationTokenScopesAreActive(resource, grant?.scopes ?? [], code.scopes)
  ) {
    throw invalidGrant();
  }

  const issued = createTokenPair(
    ctx,
    client,
    grant.id,
    user,
    code.protectedResourceId,
    code.scopes,
    0
  );
  const nonce = code.nonceCiphertext && code.nonceNonce && code.encryptionKeyId
    ? await decryptAuthorizationNonce(ctx, {
        id: code.id,
        authorizationClientId: code.authorizationClientId,
        nonceCiphertext: code.nonceCiphertext,
        nonceNonce: code.nonceNonce,
        encryptionKeyId: code.encryptionKeyId
      })
    : null;
  const idToken = code.scopes.includes("openid")
    ? await createAuthorizationIdToken(ctx, {
        client,
        user,
        session,
        scopes: code.scopes,
        accessToken: issued.access.raw,
        accessTokenExpiresAt: issued.access.entity.expiresAt,
        nonce
      })
    : undefined;
  await storage.createAuthorizationTokens(issued.access.entity, issued.refresh?.entity ?? null);
  await audit(ctx, {
    eventType: "authorization_server.code_exchanged",
    actorUserId: user.id,
    targetUserId: user.id,
    context: input.request,
    metadata: {
      authorizationClientId: client.id,
      grantId: grant.id,
      scopes: code.scopes,
      ...(resource ? { protectedResourceId: resource.id } : {})
    }
  });
  return tokenResponse(
    issued.access.raw,
    issued.access.entity.expiresAt,
    code.scopes,
    issued.refresh?.raw,
    idToken
  );
}

async function exchangeRefreshToken(
  ctx: AuthEngineContext,
  client: AuthorizationClient,
  input: AuthorizationTokenRequestInput
): Promise<AuthorizationTokenResponse> {
  const { storage } = requireAuthorizationServer(ctx);
  const rawRefreshToken = requiredToken(
    input.refreshToken,
    "refresh_token",
    authorizationServerTokenPrefixes.refreshToken
  );
  const tokenHash = hashAuthorizationSecret(ctx, rawRefreshToken);
  const requestedResource = optionalResource(input.resource);
  const current = await storage.getAuthorizationRefreshTokenByHash(tokenHash);
  if (
    !current ||
    current.authorizationClientId !== client.id ||
    current.revokedAt ||
    isExpired(current.expiresAt)
  ) {
    throw invalidGrant();
  }
  const [grant, user, resource] = await Promise.all([
    storage.getAuthorizationGrant(
      client.id,
      current.userId,
      current.protectedResourceId
    ),
    ctx.storage.getUserById(current.userId),
    loadTokenResource(ctx, current.protectedResourceId, requestedResource)
  ]);
  if (
    !grant ||
    grant.id !== current.grantId ||
    grant.revokedAt ||
    !user ||
    user.disabledAt ||
    !authorizationTokenScopesAreActive(resource, grant?.scopes ?? [], current.scopes)
  ) {
    throw invalidGrant();
  }
  const scopes = refreshScopes(input.scope, current.scopes);
  const issued = createTokenPair(
    ctx,
    client,
    current.grantId,
    user,
    current.protectedResourceId,
    scopes,
    current.generation + 1,
    true
  );
  if (!issued.refresh) throw new Error("Refresh rotation did not create a refresh token");
  const rotatedAt = new Date();
  const result = await storage.rotateAuthorizationRefreshToken({
    tokenHash,
    authorizationClientId: client.id,
    replacementRefreshToken: issued.refresh.entity,
    accessToken: issued.access.entity,
    rotatedAt
  });
  if (result === "reused") {
    await audit(ctx, {
      eventType: "authorization_server.refresh_reuse_detected",
      actorUserId: user.id,
      targetUserId: user.id,
      context: input.request,
      metadata: {
        authorizationClientId: client.id,
        grantId: current.grantId
      }
    });
    await audit(ctx, {
      eventType: "authorization_server.grant_revoked",
      actorUserId: user.id,
      targetUserId: user.id,
      context: input.request,
      metadata: {
        authorizationClientId: client.id,
        grantId: current.grantId,
        reason: "refresh_token_reuse"
      }
    });
    throw invalidGrant();
  }
  if (result !== "rotated") throw invalidGrant();

  await audit(ctx, {
    eventType: "authorization_server.token_refreshed",
    actorUserId: user.id,
    targetUserId: user.id,
    context: input.request,
    metadata: {
      authorizationClientId: client.id,
      grantId: current.grantId,
      scopes,
      ...(resource ? { protectedResourceId: resource.id } : {})
    }
  });
  return tokenResponse(
    issued.access.raw,
    issued.access.entity.expiresAt,
    scopes,
    issued.refresh.raw
  );
}

function createTokenPair(
  ctx: AuthEngineContext,
  client: AuthorizationClient,
  grantId: string,
  user: User,
  protectedResourceId: string | null,
  scopes: string[],
  refreshGeneration: number,
  forceRefresh = false
): {
  access: { raw: string; entity: AuthorizationAccessToken };
  refresh: { raw: string; entity: AuthorizationRefreshToken } | null;
} {
  const { config } = requireAuthorizationServer(ctx);
  const now = new Date();
  const rawAccess = createAccessToken();
  const access: AuthorizationAccessToken = {
    id: createId("oat"),
    tokenHash: hashAuthorizationSecret(ctx, rawAccess),
    prefix: authorizationTokenPrefix(rawAccess),
    grantId,
    authorizationClientId: client.id,
    userId: user.id,
    protectedResourceId,
    scopes: [...scopes],
    expiresAt: new Date(now.getTime() + config.accessTokenTtlMs),
    revokedAt: null,
    createdAt: now
  };
  if (!forceRefresh && !scopes.includes("offline_access")) {
    return { access: { raw: rawAccess, entity: access }, refresh: null };
  }
  const rawRefresh = createRefreshToken();
  return {
    access: { raw: rawAccess, entity: access },
    refresh: {
      raw: rawRefresh,
      entity: {
        id: createId("ort"),
        tokenHash: hashAuthorizationSecret(ctx, rawRefresh),
        prefix: authorizationTokenPrefix(rawRefresh),
        grantId,
        authorizationClientId: client.id,
        userId: user.id,
        protectedResourceId,
        scopes: [...scopes],
        generation: refreshGeneration,
        replacedByTokenId: null,
        expiresAt: new Date(now.getTime() + config.refreshTokenTtlMs),
        consumedAt: null,
        revokedAt: null,
        createdAt: now
      }
    }
  };
}

function tokenResponse(
  accessToken: string,
  expiresAt: Date,
  scopes: readonly string[],
  refreshToken?: string,
  idToken?: string
): AuthorizationTokenResponse {
  return {
    token_type: "Bearer",
    access_token: accessToken,
    expires_in: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
    scope: scopes.join(" "),
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
    ...(idToken ? { id_token: idToken } : {})
  };
}

function refreshScopes(value: string | undefined, current: string[]): string[] {
  if (value === undefined) return [...current];
  if (value.length > 4_096) {
    throw new AuthorizationProtocolError("invalid_scope", "scope is too long");
  }
  const scopes = value.trim().split(/\s+/).filter(Boolean);
  if (
    scopes.length === 0 ||
    scopes.length > 100 ||
    new Set(scopes).size !== scopes.length ||
    scopes.some((scope) => !current.includes(scope))
  ) {
    throw new AuthorizationProtocolError(
      "invalid_scope",
      "Refresh token scopes must be a subset of the original grant"
    );
  }
  return scopes;
}

function usableSession(session: Session | null): session is Session {
  return Boolean(
    session &&
    !session.revokedAt &&
    !isExpired(session.expiresAt) &&
    !isExpired(session.idleExpiresAt)
  );
}

function requiredToken(
  value: string | undefined,
  field: string,
  prefix: string
): string {
  const token = requiredText(value, field);
  if (!token.startsWith(prefix) || token.length > 512) throw invalidGrant();
  return token;
}

function requiredText(value: string | undefined, field: string): string {
  if (typeof value !== "string" || !value || value.length > 2_048) {
    throw new AuthorizationProtocolError("invalid_request", `${field} is required`);
  }
  return value;
}

function invalidGrant(): AuthorizationProtocolError {
  return new AuthorizationProtocolError(
    "invalid_grant",
    "The authorization grant is invalid, expired, revoked, or already used"
  );
}

function optionalResource(value: string | undefined): string | null {
  if (value === undefined) return null;
  try {
    return normalizeProtectedResourceIdentifier(value);
  } catch {
    throw new AuthorizationProtocolError(
      "invalid_target",
      "resource must identify a registered protected resource"
    );
  }
}

async function loadTokenResource(
  ctx: AuthEngineContext,
  protectedResourceId: string | null,
  requestedIdentifier: string | null
): Promise<ProtectedResource | null> {
  if (protectedResourceId === null) {
    if (requestedIdentifier !== null) throw invalidTarget();
    return null;
  }
  const resource = await requireAuthorizationServer(ctx).storage
    .getProtectedResourceById(protectedResourceId);
  if (!isActiveProtectedResource(resource)) throw invalidGrant();
  if (requestedIdentifier !== null && requestedIdentifier !== resource.identifier) {
    throw invalidTarget();
  }
  return resource;
}

function invalidTarget(): AuthorizationProtocolError {
  return new AuthorizationProtocolError(
    "invalid_target",
    "The protected resource does not match the authorization grant"
  );
}
