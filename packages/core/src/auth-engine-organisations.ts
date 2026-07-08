import { AuthError } from "./errors.js";
import { createId } from "./crypto.js";
import { slugify } from "./normalise.js";
import { roleHasPermission, type Permission } from "./permissions.js";
import type { Organisation, OrganisationMember } from "./types.js";
import type {
  ChangeMemberRoleInput,
  CreateOrganisationInput,
  RemoveMemberInput,
  UpdateOrganisationInput
} from "./auth-engine-types.js";
import {
  audit,
  cloneMetadata,
  uniqueOrganisationSlug,
  type AuthEngineContext
} from "./auth-engine-internals.js";

export async function createOrganisation(
  ctx: AuthEngineContext,
  input: CreateOrganisationInput
): Promise<{
  organisation: Organisation;
  ownerMembership: OrganisationMember;
}> {
  const owner = await ctx.storage.getUserById(input.ownerUserId);
  if (!owner) {
    throw new AuthError("user_not_found", "Owner user not found", 404);
  }

  const now = new Date();
  const baseSlug = slugify(input.slug ?? input.name);
  const slug = await uniqueOrganisationSlug(ctx, baseSlug);
  const organisation = await ctx.storage.createOrganisation({
    id: createId("org"),
    name: input.name,
    slug,
    ownerUserId: input.ownerUserId,
    metadata: cloneMetadata(input.metadata),
    createdAt: now,
    updatedAt: now,
    disabledAt: null
  });
  const ownerMembership = await ctx.storage.createOrganisationMember({
    id: createId("mem"),
    organisationId: organisation.id,
    userId: input.ownerUserId,
    role: "owner",
    status: "active",
    joinedAt: now,
    removedAt: null,
    createdAt: now,
    updatedAt: now
  });

  await audit(ctx, {
    eventType: "organisation.created",
    actorUserId: input.ownerUserId,
    targetUserId: input.ownerUserId,
    organisationId: organisation.id,
    context: input.request,
    metadata: { name: input.name, slug }
  });

  return { organisation, ownerMembership };
}

export async function updateOrganisation(
  ctx: AuthEngineContext,
  organisationId: string,
  input: UpdateOrganisationInput
): Promise<Organisation> {
  await requirePermission(ctx, organisationId, input.actorUserId, "manage_organisation");

  const patch: Partial<Organisation> = {
    updatedAt: new Date()
  };

  if (input.name !== undefined) patch.name = input.name;
  if (input.slug !== undefined) {
    patch.slug = await uniqueOrganisationSlug(ctx, slugify(input.slug));
  }
  if (input.metadata !== undefined) patch.metadata = cloneMetadata(input.metadata);

  const organisation = await ctx.storage.updateOrganisation(organisationId, patch);
  if (!organisation) {
    throw new AuthError("organisation_not_found", "Organisation not found", 404);
  }

  await audit(ctx, {
    eventType: "organisation.updated",
    actorUserId: input.actorUserId,
    organisationId,
    context: input.request,
    metadata: patch
  });

  return organisation;
}

export async function changeMemberRole(
  ctx: AuthEngineContext,
  input: ChangeMemberRoleInput
): Promise<OrganisationMember> {
  await requirePermission(ctx, input.organisationId, input.actorUserId, "change_member_roles");

  const organisation = await ctx.storage.getOrganisationById(input.organisationId);
  const member = await ctx.storage.getOrganisationMemberById(input.memberId);
  if (!organisation || !member || member.organisationId !== input.organisationId) {
    throw new AuthError("member_not_found", "Member not found", 404);
  }

  if (member.userId === organisation.ownerUserId && input.role !== "owner") {
    throw new AuthError("unsafe_owner_removal", "Transfer ownership before changing owner role", 409);
  }

  const updatedMember = await ctx.storage.updateOrganisationMember(member.id, {
    role: input.role,
    updatedAt: new Date()
  });

  await audit(ctx, {
    eventType: "member.role_changed",
    actorUserId: input.actorUserId,
    targetUserId: member.userId,
    organisationId: input.organisationId,
    context: input.request,
    metadata: { role: input.role }
  });

  return updatedMember ?? member;
}

export async function removeMember(
  ctx: AuthEngineContext,
  input: RemoveMemberInput
): Promise<OrganisationMember> {
  await requirePermission(ctx, input.organisationId, input.actorUserId, "remove_members");

  const organisation = await ctx.storage.getOrganisationById(input.organisationId);
  const member = await ctx.storage.getOrganisationMemberById(input.memberId);
  if (!organisation || !member || member.organisationId !== input.organisationId) {
    throw new AuthError("member_not_found", "Member not found", 404);
  }

  if (member.userId === organisation.ownerUserId) {
    throw new AuthError("unsafe_owner_removal", "Transfer ownership before removing owner", 409);
  }

  const now = new Date();
  const updatedMember = await ctx.storage.updateOrganisationMember(member.id, {
    status: "removed",
    removedAt: now,
    updatedAt: now
  });

  await audit(ctx, {
    eventType: "member.removed",
    actorUserId: input.actorUserId,
    targetUserId: member.userId,
    organisationId: input.organisationId,
    context: input.request
  });

  return updatedMember ?? member;
}

export async function checkPermission(
  ctx: AuthEngineContext,
  organisationId: string,
  userId: string,
  permission: Permission
): Promise<boolean> {
  const member = await ctx.storage.getOrganisationMember(organisationId, userId);
  return Boolean(member && member.status === "active" && roleHasPermission(member.role, permission));
}

export async function requirePermission(
  ctx: AuthEngineContext,
  organisationId: string,
  userId: string,
  permission: Permission
): Promise<OrganisationMember> {
  const member = await ctx.storage.getOrganisationMember(organisationId, userId);

  if (!member || member.status !== "active" || !roleHasPermission(member.role, permission)) {
    throw new AuthError("permission_denied", "You do not have permission for this action", 403);
  }

  return member;
}

export async function listOrganisations(
  ctx: AuthEngineContext,
  userId: string
): Promise<Organisation[]> {
  return ctx.storage.listOrganisationsByUserId(userId);
}
