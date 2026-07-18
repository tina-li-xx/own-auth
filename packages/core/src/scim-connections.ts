import { createId, hashSecret, randomBase64Url } from "./crypto.js";
import { AuthError } from "./errors.js";
import { audit } from "./auth-engine-internals.js";
import type { AuthEngineContext } from "./auth-engine-context.js";
import { hash } from "./auth-engine-token-helpers.js";
import { requireOrganisationOwner } from "./auth-engine-organisation-access.js";
import type {
  CreateScimConnectionInput,
  CreatedScimToken,
  CreateScimTokenInput,
  ListScimConnectionsInput,
  PublicScimConnection,
  RevokeScimTokenInput,
  ScimConnection,
  ScimConnectionAccessInput,
  ScimTokenDetails,
  UpdateScimConnectionInput
} from "./scim-types.js";
import {
  bounded,
  publicScimConnection,
  publicScimToken,
  requireScimAccountLinking,
  requireScim,
  requireScimConnection,
  requireScimRole
} from "./scim-helpers.js";

const tokenPrefix = "oa_scim_";

export async function createConnection(
  ctx: AuthEngineContext,
  input: CreateScimConnectionInput
): Promise<PublicScimConnection> {
  const { storage } = requireScim(ctx);
  await requireOrganisationOwner(ctx, input.organisationId, input.actorUserId);
  const samlConnectionId = await validateSamlPair(
    ctx, input.organisationId, input.samlConnectionId ?? null
  );
  const now = new Date();
  const connection: ScimConnection = {
    id: createId("scimc"),
    organisationId: input.organisationId,
    key: `scim_${hashSecret(randomBase64Url(32)).slice(0, 20)}`,
    name: bounded(input.name, "name", 100),
    defaultRole: requireScimRole(ctx, input.defaultRole ?? "member"),
    accountLinking: requireScimAccountLinking(input.accountLinking ?? "explicit"),
    samlConnectionId,
    disabledAt: null,
    createdAt: now,
    updatedAt: now
  };
  let created: ScimConnection;
  try {
    created = await storage.createConnection(connection);
  } catch (error) {
    if (samlConnectionId && (await storage.listConnectionsByOrganisationId(input.organisationId))
      .some((candidate) => candidate.samlConnectionId === samlConnectionId)) {
      throw new AuthError("validation_error", "SAML connection is already paired with SCIM", 409);
    }
    throw error;
  }
  await auditConnection(ctx, created, input.actorUserId, "scim.connection_created", input.request);
  return publicScimConnection(created);
}

export async function getConnection(
  ctx: AuthEngineContext,
  input: ScimConnectionAccessInput
): Promise<PublicScimConnection> {
  const connection = await requireScimConnection(ctx, input.connectionId, true);
  await requireOrganisationOwner(ctx, connection.organisationId, input.actorUserId);
  return publicScimConnection(connection);
}

export async function listConnections(
  ctx: AuthEngineContext,
  input: ListScimConnectionsInput
): Promise<PublicScimConnection[]> {
  const { storage } = requireScim(ctx);
  await requireOrganisationOwner(ctx, input.organisationId, input.actorUserId);
  return (await storage.listConnectionsByOrganisationId(input.organisationId))
    .map(publicScimConnection);
}

export async function updateConnection(
  ctx: AuthEngineContext,
  input: UpdateScimConnectionInput
): Promise<PublicScimConnection> {
  const { storage } = requireScim(ctx);
  const connection = await requireScimConnection(ctx, input.connectionId, true);
  await requireOrganisationOwner(ctx, connection.organisationId, input.actorUserId);
  const patch: Partial<ScimConnection> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = bounded(input.name, "name", 100);
  if (input.defaultRole !== undefined) patch.defaultRole = requireScimRole(ctx, input.defaultRole);
  if (input.accountLinking !== undefined) {
    patch.accountLinking = requireScimAccountLinking(input.accountLinking);
  }
  if (input.samlConnectionId !== undefined) {
    patch.samlConnectionId = await validateSamlPair(
      ctx, connection.organisationId, input.samlConnectionId
    );
  }
  const updated = await storage.updateConnection(connection.id, patch);
  if (!updated) throw notFound();
  await auditConnection(ctx, updated, input.actorUserId, "scim.connection_updated", input.request);
  return publicScimConnection(updated);
}

export async function setConnectionEnabled(
  ctx: AuthEngineContext,
  input: ScimConnectionAccessInput,
  enabled: boolean
): Promise<PublicScimConnection> {
  const { storage } = requireScim(ctx);
  const connection = await requireScimConnection(ctx, input.connectionId, true);
  await requireOrganisationOwner(ctx, connection.organisationId, input.actorUserId);
  const updated = await storage.updateConnection(connection.id, {
    disabledAt: enabled ? null : new Date(),
    updatedAt: new Date()
  });
  if (!updated) throw notFound();
  await auditConnection(
    ctx,
    updated,
    input.actorUserId,
    enabled ? "scim.connection_enabled" : "scim.connection_disabled",
    input.request
  );
  return publicScimConnection(updated);
}

export async function createToken(
  ctx: AuthEngineContext,
  input: CreateScimTokenInput
): Promise<CreatedScimToken> {
  const { storage } = requireScim(ctx);
  const connection = await requireScimConnection(ctx, input.connectionId, true);
  await requireOrganisationOwner(ctx, connection.organisationId, input.actorUserId);
  const now = new Date();
  if (input.expiresAt && input.expiresAt <= now) {
    throw new AuthError("validation_error", "SCIM token expiry must be in the future", 400);
  }
  const rawToken = `${tokenPrefix}${randomBase64Url(32)}`;
  const created = await storage.createToken({
    id: createId("scimt"),
    connectionId: connection.id,
    name: bounded(input.name, "name", 100),
    prefix: rawToken.slice(0, 20),
    tokenHash: hashScimToken(ctx, rawToken),
    expiresAt: input.expiresAt ?? null,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: now
  });
  await audit(ctx, {
    eventType: "scim.token_created",
    actorUserId: input.actorUserId,
    organisationId: connection.organisationId,
    context: input.request,
    metadata: { connectionId: connection.id, tokenId: created.id }
  });
  return { token: publicScimToken(created), rawToken };
}

export async function listTokens(
  ctx: AuthEngineContext,
  input: ScimConnectionAccessInput
): Promise<ScimTokenDetails[]> {
  const { storage } = requireScim(ctx);
  const connection = await requireScimConnection(ctx, input.connectionId, true);
  await requireOrganisationOwner(ctx, connection.organisationId, input.actorUserId);
  return (await storage.listTokensByConnectionId(connection.id)).map(publicScimToken);
}

export async function revokeToken(
  ctx: AuthEngineContext,
  input: RevokeScimTokenInput
): Promise<ScimTokenDetails> {
  const { storage } = requireScim(ctx);
  const connection = await requireScimConnection(ctx, input.connectionId, true);
  await requireOrganisationOwner(ctx, connection.organisationId, input.actorUserId);
  const token = await storage.getTokenById(input.tokenId);
  if (!token || token.connectionId !== connection.id) {
    throw new AuthError("scim_token_invalid", "SCIM token not found", 404);
  }
  const updated = token.revokedAt ? token : await storage.updateToken(token.id, { revokedAt: new Date() });
  if (!updated) throw new AuthError("scim_token_invalid", "SCIM token not found", 404);
  if (!token.revokedAt) {
    await audit(ctx, {
      eventType: "scim.token_revoked",
      actorUserId: input.actorUserId,
      organisationId: connection.organisationId,
      context: input.request,
      metadata: { connectionId: connection.id, tokenId: token.id }
    });
  }
  return publicScimToken(updated);
}

export function hashScimToken(ctx: AuthEngineContext, rawToken: string): string {
  return hash(ctx, `own-auth:scim-token:v1:${rawToken}`);
}

async function validateSamlPair(
  ctx: AuthEngineContext,
  organisationId: string,
  samlConnectionId: string | null
): Promise<string | null> {
  if (!samlConnectionId) return null;
  const saml = ctx.samlStorage && await ctx.samlStorage.getConnectionById(samlConnectionId);
  if (!saml || saml.organisationId !== organisationId) {
    throw new AuthError("validation_error", "SAML connection is invalid", 400);
  }
  return saml.id;
}

function auditConnection(
  ctx: AuthEngineContext,
  connection: ScimConnection,
  actorUserId: string,
  eventType: "scim.connection_created" | "scim.connection_updated" |
    "scim.connection_disabled" | "scim.connection_enabled",
  request: ScimConnectionAccessInput["request"]
): Promise<void> {
  return audit(ctx, {
    eventType,
    actorUserId,
    organisationId: connection.organisationId,
    context: request,
    metadata: { connectionId: connection.id }
  });
}

function notFound(): AuthError {
  return new AuthError("scim_connection_not_found", "SCIM connection not found", 404);
}
