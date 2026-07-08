import { AuthError } from "./errors.js";
import { createId, randomBase64Url, safeEqual } from "./crypto.js";
import { isExpired } from "./normalise.js";
import type { ApiKey, RequestContext, VerifiedApiKey } from "./types.js";
import { hour, type ApiKeyListFilter, type CreatedApiKey, type CreateApiKeyInput } from "./auth-engine-types.js";
import {
  audit,
  cloneMetadata,
  extractApiKeyPrefix,
  hash,
  rateLimit,
  type AuthEngineContext
} from "./auth-engine-internals.js";
import { requirePermission } from "./auth-engine-organisations.js";

export async function createApiKey(
  ctx: AuthEngineContext,
  input: CreateApiKeyInput
): Promise<CreatedApiKey> {
  if (!input.userId && !input.organisationId) {
    throw new AuthError("permission_denied", "API keys need a user or organisation owner", 400);
  }

  if (input.organisationId && input.actorUserId) {
    await requirePermission(ctx, input.organisationId, input.actorUserId, "manage_api_keys");
  }

  await rateLimit(
    ctx,
    "api-key-create",
    input.organisationId ?? input.userId ?? input.actorUserId ?? "anonymous",
    20,
    hour
  );

  const prefix = randomBase64Url(6).replace(/[-_]/g, "").slice(0, 8);
  const rawKey = `oa_${prefix}_${randomBase64Url(32)}`;
  const now = new Date();
  const apiKey = await ctx.storage.createApiKey({
    id: createId("key"),
    keyPrefix: prefix,
    keyHash: hash(ctx, rawKey),
    name: input.name,
    userId: input.userId ?? null,
    organisationId: input.organisationId ?? null,
    scopes: input.scopes ?? [],
    status: "active",
    expiresAt: input.expiresAt ?? null,
    lastUsedAt: null,
    createdAt: now,
    revokedAt: null,
    revokedBy: null,
    metadata: cloneMetadata(input.metadata)
  });

  await audit(ctx, {
    eventType: "api_key.created",
    actorUserId: input.actorUserId ?? input.userId ?? null,
    targetUserId: input.userId ?? null,
    organisationId: input.organisationId ?? null,
    apiKeyId: apiKey.id,
    context: input.request,
    metadata: { name: input.name, scopes: apiKey.scopes }
  });

  return { apiKey, rawKey };
}

export async function verifyApiKey(
  ctx: AuthEngineContext,
  rawKey: string,
  requiredScopes: string[] = []
): Promise<VerifiedApiKey> {
  const prefix = extractApiKeyPrefix(rawKey);
  if (!prefix) {
    throw new AuthError("api_key_invalid", "Invalid API key", 401);
  }

  const apiKey = await ctx.storage.getApiKeyByPrefix(prefix);
  if (!apiKey || !safeEqual(hash(ctx, rawKey), apiKey.keyHash)) {
    throw new AuthError("api_key_invalid", "Invalid API key", 401);
  }

  if (apiKey.status === "revoked" || apiKey.revokedAt) {
    throw new AuthError("api_key_revoked", "API key has been revoked", 401);
  }

  if (apiKey.expiresAt && isExpired(apiKey.expiresAt)) {
    throw new AuthError("api_key_expired", "API key has expired", 401);
  }

  const hasAllScopes = requiredScopes.every(
    (scope) => apiKey.scopes.includes("*") || apiKey.scopes.includes(scope)
  );

  if (!hasAllScopes) {
    throw new AuthError("insufficient_scope", "API key does not have the required scope", 403);
  }

  const updatedApiKey = await ctx.storage.updateApiKey(apiKey.id, {
    lastUsedAt: new Date()
  });
  const activeApiKey = updatedApiKey ?? apiKey;

  await audit(ctx, {
    eventType: "api_key.used",
    actorUserId: activeApiKey.userId,
    targetUserId: activeApiKey.userId,
    organisationId: activeApiKey.organisationId,
    apiKeyId: activeApiKey.id,
    metadata: { requiredScopes }
  });

  const user = activeApiKey.userId ? await ctx.storage.getUserById(activeApiKey.userId) : null;
  const organisation = activeApiKey.organisationId
    ? await ctx.storage.getOrganisationById(activeApiKey.organisationId)
    : null;

  return {
    apiKey: activeApiKey,
    user,
    organisation
  };
}

export async function revokeApiKey(
  ctx: AuthEngineContext,
  keyPrefixOrId: string,
  revokedBy?: string,
  context?: RequestContext
): Promise<ApiKey> {
  let apiKey = await ctx.storage.getApiKeyByPrefix(keyPrefixOrId);

  if (!apiKey) {
    throw new AuthError("api_key_invalid", "Invalid API key", 404);
  }

  const updatedApiKey = await ctx.storage.updateApiKey(apiKey.id, {
    status: "revoked",
    revokedAt: new Date(),
    revokedBy: revokedBy ?? null
  });
  apiKey = updatedApiKey ?? apiKey;

  await audit(ctx, {
    eventType: "api_key.revoked",
    actorUserId: revokedBy ?? apiKey.userId,
    targetUserId: apiKey.userId,
    organisationId: apiKey.organisationId,
    apiKeyId: apiKey.id,
    context
  });

  return apiKey;
}

export async function listApiKeys(
  ctx: AuthEngineContext,
  filter: ApiKeyListFilter
): Promise<ApiKey[]> {
  if (filter.organisationId) {
    return ctx.storage.listApiKeysByOrganisationId(filter.organisationId);
  }

  if (filter.userId) {
    return ctx.storage.listApiKeysByUserId(filter.userId);
  }

  return [];
}
