import { AuthError } from "./errors.js";
import { createId } from "./crypto.js";
import { isExpired, normalizeEmail } from "./normalise.js";
import type { Invitation, OrganisationMember, User } from "./types.js";
import type {
  AcceptInvitationInput,
  InvitationResult,
  InviteMemberInput,
  RevokeInvitationInput
} from "./auth-engine-types.js";
import {
  audit,
  buildUrl,
  consumeToken,
  issueToken,
  type AuthEngineContext
} from "./auth-engine-internals.js";
import { createUser } from "./auth-engine-users.js";
import { requirePermission } from "./auth-engine-organisations.js";

export async function inviteMember(
  ctx: AuthEngineContext,
  input: InviteMemberInput
): Promise<InvitationResult> {
  await requirePermission(ctx, input.organisationId, input.invitedByUserId, "invite_members");

  const email = normalizeEmail(input.email);
  const now = new Date();
  const invitation = await ctx.storage.createInvitation({
    id: createId("inv"),
    organisationId: input.organisationId,
    email,
    phone: null,
    role: input.role ?? "member",
    invitedByUserId: input.invitedByUserId,
    status: "pending",
    expiresAt: new Date(now.getTime() + ctx.tokenTtls.organisation_invite),
    acceptedAt: null,
    revokedAt: null,
    createdAt: now
  });
  const issued = await issueToken(ctx, "organisation_invite", {
    userId: null,
    email,
    organisationId: input.organisationId,
    ttlMs: ctx.tokenTtls.organisation_invite
  });
  const url = buildUrl(ctx, "/auth/invitations/accept", { token: issued.rawToken });

  await ctx.emailProvider.send({
    to: email,
    type: "organisation_invite",
    token: issued.rawToken,
    url,
    expiresAt: issued.token.expiresAt
  });

  await audit(ctx, {
    eventType: "member.invited",
    actorUserId: input.invitedByUserId,
    organisationId: input.organisationId,
    context: input.request,
    metadata: { email, role: invitation.role, invitationId: invitation.id }
  });

  const result: InvitationResult = { invitation };
  if (ctx.exposeRawTokens) {
    result.token = issued.rawToken;
    result.url = url;
  }

  return result;
}

export async function acceptInvitation(
  ctx: AuthEngineContext,
  input: AcceptInvitationInput
): Promise<{ invitation: Invitation; user: User; member: OrganisationMember }> {
  const token = await consumeToken(ctx, input.token, "organisation_invite");
  const organisationId = token.organisationId;
  if (!organisationId) {
    throw new AuthError("invalid_token", "Invalid token", 401);
  }

  const pendingInvitation = token.email
    ? await ctx.storage.getPendingInvitationByOrganisationAndEmail(organisationId, token.email)
    : null;
  if (!pendingInvitation) {
    throw new AuthError("invitation_not_found", "Invitation not found", 404);
  }

  if (pendingInvitation.status !== "pending") {
    throw new AuthError("invitation_not_pending", "Invitation is not pending", 409);
  }

  if (isExpired(pendingInvitation.expiresAt)) {
    await ctx.storage.updateInvitation(pendingInvitation.id, { status: "expired" });
    throw new AuthError("expired_token", "Invitation has expired", 401);
  }

  let user = input.userId ? await ctx.storage.getUserById(input.userId) : null;
  if (!user && token.email) {
    user = await ctx.storage.getUserByEmail(token.email);
  }

  if (!user && token.email) {
    user = await createUser(ctx, { email: token.email });
    user = (await ctx.storage.updateUser(user.id, {
      emailVerifiedAt: new Date(),
      updatedAt: new Date()
    })) ?? user;
  }

  if (!user) {
    throw new AuthError("user_not_found", "User not found", 404);
  }

  const now = new Date();
  let member = await ctx.storage.getOrganisationMember(organisationId, user.id);
  if (member) {
    member = (await ctx.storage.updateOrganisationMember(member.id, {
      role: pendingInvitation.role,
      status: "active",
      joinedAt: member.joinedAt ?? now,
      removedAt: null,
      updatedAt: now
    })) ?? member;
  } else {
    member = await ctx.storage.createOrganisationMember({
      id: createId("mem"),
      organisationId,
      userId: user.id,
      role: pendingInvitation.role,
      status: "active",
      joinedAt: now,
      removedAt: null,
      createdAt: now,
      updatedAt: now
    });
  }

  const invitation = (await ctx.storage.updateInvitation(pendingInvitation.id, {
    status: "accepted",
    acceptedAt: now
  })) ?? pendingInvitation;

  await audit(ctx, {
    eventType: "invite.accepted",
    actorUserId: user.id,
    targetUserId: user.id,
    organisationId,
    context: input.request,
    metadata: { invitationId: invitation.id }
  });

  return { invitation, user, member };
}

export async function revokeInvitation(
  ctx: AuthEngineContext,
  input: RevokeInvitationInput
): Promise<Invitation> {
  const invitation = await ctx.storage.getInvitationById(input.invitationId);
  if (!invitation) {
    throw new AuthError("invitation_not_found", "Invitation not found", 404);
  }

  if (invitation.status !== "pending") {
    throw new AuthError("invitation_not_pending", "Invitation is not pending", 409);
  }

  await requirePermission(ctx, invitation.organisationId, input.actorUserId, "invite_members");

  const now = new Date();
  const updatedInvitation = await ctx.storage.updateInvitation(input.invitationId, {
    status: "revoked",
    revokedAt: now
  });

  await audit(ctx, {
    eventType: "invite.revoked",
    actorUserId: input.actorUserId,
    organisationId: invitation.organisationId,
    context: input.request,
    metadata: { invitationId: invitation.id, email: invitation.email }
  });

  return updatedInvitation ?? invitation;
}

export async function listInvitations(
  ctx: AuthEngineContext,
  organisationId: string
): Promise<Invitation[]> {
  return ctx.storage.listInvitationsByOrganisationId(organisationId);
}
