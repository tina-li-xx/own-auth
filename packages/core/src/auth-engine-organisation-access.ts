import { AuthError } from "./errors.js";
import type { Organisation, OrganisationMember } from "./types.js";
import type { AuthEngineContext } from "./auth-engine-context.js";

export async function checkPermission(
  ctx: AuthEngineContext,
  organisationId: string,
  userId: string,
  permission: string
): Promise<boolean> {
  const organisation = await ctx.storage.getOrganisationById(organisationId);
  if (!organisation || organisation.disabledAt) {
    return false;
  }

  const user = await ctx.storage.getUserById(userId);
  if (!user || user.disabledAt) {
    return false;
  }

  const member = await ctx.storage.getOrganisationMember(organisationId, userId);
  return Boolean(
    member?.status === "active" &&
    ctx.authorization.hasPermission(member.role, permission)
  );
}

export async function requireActiveOrganisation(
  ctx: AuthEngineContext,
  organisationId: string
): Promise<Organisation> {
  const organisation = await ctx.storage.getOrganisationById(organisationId);
  if (!organisation || organisation.disabledAt) {
    throw new AuthError("organisation_not_found", "Organisation not found", 404);
  }

  return organisation;
}

export async function requireOrganisationAccess(
  ctx: AuthEngineContext,
  organisationId: string,
  userId: string
): Promise<{ organisation: Organisation; member: OrganisationMember<string> }> {
  const organisation = await requireActiveOrganisation(ctx, organisationId);
  const user = await ctx.storage.getUserById(userId);
  if (!user || user.disabledAt) {
    throw new AuthError("organisation_not_found", "Organisation not found", 404);
  }

  const member = await ctx.storage.getOrganisationMember(organisationId, userId);
  if (!member || member.status !== "active") {
    throw new AuthError("organisation_not_found", "Organisation not found", 404);
  }

  return { organisation, member };
}

export async function requirePermission(
  ctx: AuthEngineContext,
  organisationId: string,
  userId: string,
  permission: string
): Promise<OrganisationMember<string>> {
  await requireActiveOrganisation(ctx, organisationId);
  const user = await ctx.storage.getUserById(userId);
  if (!user || user.disabledAt) {
    throw new AuthError("permission_denied", "Permission denied", 403);
  }

  const member = await ctx.storage.getOrganisationMember(organisationId, userId);
  if (!member || member.status !== "active") {
    throw new AuthError("permission_denied", "You do not have permission for this action", 403);
  }
  requireConfiguredRole(ctx, member.role);
  if (!ctx.authorization.hasPermission(member.role, permission)) {
    throw new AuthError("permission_denied", "You do not have permission for this action", 403);
  }

  return member;
}

export function requireConfiguredRole(ctx: AuthEngineContext, role: string): void {
  if (!ctx.authorization.hasRole(role)) {
    throw new AuthError("role_not_configured", "Role is not configured", 409);
  }
}
