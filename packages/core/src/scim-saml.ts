import type { AuthEngineContext } from "./auth-engine-context.js";
import { createAuditEvent } from "./auth-engine-internals.js";
import type { ScimUser } from "./scim-types.js";
import type { RequestContext, User } from "./types.js";

export async function findPairedSamlUser(
  ctx: AuthEngineContext,
  samlConnectionId: string,
  normalizedEmail: string
): Promise<ScimUser | null> {
  if (!ctx.scimStorage) return null;
  return ctx.scimStorage.findActiveUserBySamlConnection(samlConnectionId, normalizedEmail);
}

export async function verifyPairedSamlEmail(
  ctx: AuthEngineContext,
  samlConnectionId: string,
  resource: ScimUser,
  user: User,
  normalizedEmail: string,
  request?: RequestContext
): Promise<User> {
  if (resource.userId !== user.id || user.email !== normalizedEmail || user.emailVerifiedAt) {
    return user;
  }
  const connection = await ctx.scimStorage?.getConnectionById(resource.connectionId);
  if (!connection || connection.samlConnectionId !== samlConnectionId || connection.disabledAt) {
    return user;
  }
  const now = new Date();
  const changed = await ctx.scimStorage?.verifyPairedSamlEmail({
    userId: user.id,
    normalizedEmail,
    verifiedAt: now,
    auditEvent: createAuditEvent({
      eventType: "email.verified",
      actorUserId: user.id,
      targetUserId: user.id,
      organisationId: connection.organisationId,
      request,
      metadata: {
        method: "saml",
        samlConnectionId,
        scimConnectionId: connection.id
      },
      now
    })
  });
  return changed ? { ...user, emailVerifiedAt: now, updatedAt: now } : user;
}
