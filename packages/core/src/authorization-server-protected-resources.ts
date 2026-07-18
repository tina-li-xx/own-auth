import type { AuthEngineContext } from "./auth-engine-context.js";
import { audit } from "./auth-engine-helpers.js";
import { requireDpopConfiguration } from "./authorization-server-dpop.js";
import {
  createProtectedResourceSecret,
  extractProtectedResourceSecretPrefix,
  hashAuthorizationSecret,
  normalizeAllowedScopes,
  normalizeProtectedResourceIdentifier,
  requireAuthorizationServer
} from "./authorization-server-helpers.js";
import {
  AuthorizationProtocolError,
  invalidAuthorizationClient
} from "./authorization-server-protocol-error.js";
import type {
  CreatedProtectedResource,
  CreateProtectedResourceInput,
  ProtectedResource,
  RevokeProtectedResourceInput,
  RotateProtectedResourceSecretInput,
  UpdateProtectedResourceInput
} from "./authorization-server-types.js";
import { createId, safeEqual } from "./crypto.js";
import { AuthError } from "./errors.js";
import type { RequestContext } from "./types.js";

export async function createProtectedResource(
  ctx: AuthEngineContext,
  input: CreateProtectedResourceInput
): Promise<CreatedProtectedResource> {
  const { config, storage } = requireAuthorizationServer(ctx);
  const identifier = normalizeProtectedResourceIdentifier(input.identifier);
  const requireDpop = input.requireDpop ?? false;
  requireDpopConfiguration(ctx, requireDpop, "requireDpop");
  if (await storage.getProtectedResourceByIdentifier(identifier)) {
    throw identifierUnavailable();
  }
  const now = new Date();
  const resource: ProtectedResource = {
    id: createId("opres"),
    identifier,
    name: resourceName(input.name),
    allowedScopes: normalizeAllowedScopes(config, input.allowedScopes),
    requireDpop,
    status: "active",
    createdAt: now,
    updatedAt: now,
    revokedAt: null
  };
  const secret = createProtectedResourceSecret();
  let created: ProtectedResource;
  try {
    created = await storage.createProtectedResource(resource, {
      id: createId("oprsec"),
      protectedResourceId: resource.id,
      prefix: secret.prefix,
      secretHash: hashAuthorizationSecret(ctx, secret.raw),
      createdAt: now,
      expiresAt: null,
      revokedAt: null
    });
  } catch (error) {
    if (await storage.getProtectedResourceByIdentifier(identifier)) {
      throw identifierUnavailable();
    }
    throw error;
  }
  await auditResourceChange(
    ctx,
    "authorization_server.protected_resource_created",
    created,
    input.actorUserId,
    input.request
  );
  return { resource: created, resourceSecret: secret.raw };
}

export function listProtectedResources(
  ctx: AuthEngineContext
): Promise<ProtectedResource[]> {
  return requireAuthorizationServer(ctx).storage.listProtectedResources();
}

export async function updateProtectedResource(
  ctx: AuthEngineContext,
  input: UpdateProtectedResourceInput
): Promise<ProtectedResource> {
  const { config, storage } = requireAuthorizationServer(ctx);
  const current = await requireManagedProtectedResource(ctx, input.identifier);
  requireDpopConfiguration(ctx, input.requireDpop ?? false, "requireDpop");
  const updatedAt = new Date();
  const updated = await storage.updateProtectedResource(current.id, {
    ...(input.name === undefined ? {} : { name: resourceName(input.name) }),
    ...(input.allowedScopes === undefined
      ? {}
      : { allowedScopes: normalizeAllowedScopes(config, input.allowedScopes) }),
    ...(input.requireDpop === undefined
      ? {}
      : { requireDpop: input.requireDpop }),
    updatedAt
  });
  if (!updated) throw resourceNotFound();
  await auditResourceChange(
    ctx,
    "authorization_server.protected_resource_updated",
    updated,
    input.actorUserId,
    input.request
  );
  return updated;
}

export async function rotateProtectedResourceSecret(
  ctx: AuthEngineContext,
  input: RotateProtectedResourceSecretInput
): Promise<string> {
  const { storage } = requireAuthorizationServer(ctx);
  const resource = await requireManagedProtectedResource(ctx, input.identifier);
  const now = new Date();
  if (input.expiresAt && input.expiresAt.getTime() <= now.getTime()) {
    throw new AuthError("validation_error", "expiresAt must be in the future", 400);
  }
  const secret = createProtectedResourceSecret();
  await storage.replaceProtectedResourceSecret(resource.id, {
    id: createId("oprsec"),
    protectedResourceId: resource.id,
    prefix: secret.prefix,
    secretHash: hashAuthorizationSecret(ctx, secret.raw),
    createdAt: now,
    expiresAt: input.expiresAt ?? null,
    revokedAt: null
  }, now);
  await auditResourceChange(
    ctx,
    "authorization_server.protected_resource_secret_rotated",
    resource,
    input.actorUserId,
    input.request
  );
  return secret.raw;
}

export async function revokeProtectedResource(
  ctx: AuthEngineContext,
  input: RevokeProtectedResourceInput
): Promise<ProtectedResource> {
  const { storage } = requireAuthorizationServer(ctx);
  const resource = await requireManagedProtectedResource(ctx, input.identifier, true);
  if (resource.revokedAt) return resource;
  const revoked = await storage.revokeProtectedResource(resource.id, new Date());
  if (!revoked) throw resourceNotFound();
  await auditResourceChange(
    ctx,
    "authorization_server.protected_resource_revoked",
    revoked,
    input.actorUserId,
    input.request
  );
  return revoked;
}

export async function authenticateProtectedResource(
  ctx: AuthEngineContext,
  identifierValue: string | undefined,
  rawSecret: string | undefined
): Promise<ProtectedResource> {
  let identifier: string;
  try {
    identifier = normalizeProtectedResourceIdentifier(identifierValue ?? "");
  } catch {
    throw invalidAuthorizationClient();
  }
  const { storage } = requireAuthorizationServer(ctx);
  const resource = await storage.getProtectedResourceByIdentifier(identifier);
  if (!isActiveProtectedResource(resource)) throw invalidAuthorizationClient();
  const secretValue = rawSecret ?? "";
  const prefix = extractProtectedResourceSecretPrefix(secretValue);
  if (!prefix) throw invalidAuthorizationClient();
  const secret = await storage.getProtectedResourceSecretByPrefix(resource.id, prefix);
  if (!secret || !safeEqual(secret.secretHash, hashAuthorizationSecret(ctx, secretValue))) {
    throw invalidAuthorizationClient();
  }
  return resource;
}

export async function resolveProtectedResource(
  ctx: AuthEngineContext,
  identifier: string | null
): Promise<ProtectedResource | null> {
  if (identifier === null) return null;
  const normalized = normalizeProtectedResourceIdentifier(identifier);
  const resource = await requireAuthorizationServer(ctx).storage
    .getProtectedResourceByIdentifier(normalized);
  if (!isActiveProtectedResource(resource)) {
    throw new AuthorizationProtocolError(
      "invalid_target",
      "The requested protected resource is not available"
    );
  }
  return resource;
}

export function isActiveProtectedResource(
  resource: ProtectedResource | null | undefined
): resource is ProtectedResource {
  return Boolean(resource && resource.status === "active" && !resource.revokedAt);
}

export function isActiveProtectedResourceBinding(
  protectedResourceId: string | null,
  resource: ProtectedResource | null
): boolean {
  return protectedResourceId === null
    ? resource === null
    : isActiveProtectedResource(resource) && resource.id === protectedResourceId;
}

export function protectedResourceAllowsScopes(
  resource: ProtectedResource | null,
  ...scopeSets: readonly (readonly string[])[]
): boolean {
  return !resource || scopeSets.every((scopes) =>
    scopes.every((scope) => resource.allowedScopes.includes(scope)));
}

export function authorizationTokenScopesAreActive(
  resource: ProtectedResource | null,
  grantScopes: readonly string[],
  tokenScopes: readonly string[]
): boolean {
  return protectedResourceAllowsScopes(resource, grantScopes, tokenScopes) &&
    tokenScopes.every((scope) => grantScopes.includes(scope));
}

async function requireManagedProtectedResource(
  ctx: AuthEngineContext,
  identifierValue: string,
  includeRevoked = false
): Promise<ProtectedResource> {
  const identifier = normalizeProtectedResourceIdentifier(identifierValue);
  const resource = await requireAuthorizationServer(ctx).storage
    .getProtectedResourceByIdentifier(identifier);
  if (!resource) throw resourceNotFound();
  if (!includeRevoked && !isActiveProtectedResource(resource)) {
    throw new AuthError(
      "protected_resource_revoked",
      "Protected resource is revoked",
      409
    );
  }
  return resource;
}

function resourceName(value: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 120) {
    throw new AuthError(
      "validation_error",
      "Protected resource name must be between 1 and 120 characters",
      400
    );
  }
  return value.trim();
}

function resourceNotFound(): AuthError {
  return new AuthError(
    "protected_resource_not_found",
    "Protected resource not found",
    404
  );
}

function identifierUnavailable(): AuthError {
  return new AuthError(
    "protected_resource_identifier_unavailable",
    "Protected resource identifier is already registered and cannot be reused",
    409
  );
}

function auditResourceChange(
  ctx: AuthEngineContext,
  eventType:
    | "authorization_server.protected_resource_created"
    | "authorization_server.protected_resource_updated"
    | "authorization_server.protected_resource_secret_rotated"
    | "authorization_server.protected_resource_revoked",
  resource: ProtectedResource,
  actorUserId: string | undefined,
  request: RequestContext | undefined
): Promise<void> {
  return audit(ctx, {
    eventType,
    actorUserId: actorUserId ?? null,
    context: request,
    metadata: { protectedResourceId: resource.id }
  });
}
