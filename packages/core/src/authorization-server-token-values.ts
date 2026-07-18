import type {
  AuthorizationAccessToken,
  AuthorizationRefreshToken
} from "./authorization-server-types.js";

export function authorizationAccessTokenValues(
  token: AuthorizationAccessToken
): unknown[] {
  return [
    token.id,
    token.tokenHash,
    token.prefix,
    token.grantId,
    token.authorizationClientId,
    token.userId,
    token.protectedResourceId,
    token.scopes,
    token.dpopJkt ?? null,
    token.expiresAt,
    token.revokedAt,
    token.createdAt
  ];
}

export function authorizationRefreshTokenValues(
  token: AuthorizationRefreshToken
): unknown[] {
  return [
    token.id,
    token.tokenHash,
    token.prefix,
    token.grantId,
    token.authorizationClientId,
    token.userId,
    token.protectedResourceId,
    token.scopes,
    token.generation,
    token.replacedByTokenId,
    token.dpopJkt ?? null,
    token.expiresAt,
    token.consumedAt,
    token.revokedAt,
    token.createdAt
  ];
}
