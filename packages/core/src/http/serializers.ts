import type {
  Organisation,
  OrganisationMember,
  Session,
  User
} from "../types.js";
import type {
  AuthSessionPayload,
  DeliveryPayload,
  PublicAuthSession,
  PublicAuthUser,
  PublicOrganisation,
  PublicOrganisationMember
} from "./contract.js";

export function serializeUser(user: User): PublicAuthUser {
  return {
    id: user.id,
    email: user.email,
    emailVerifiedAt: toIso(user.emailVerifiedAt),
    phone: user.phone,
    phoneVerifiedAt: toIso(user.phoneVerifiedAt),
    name: user.name,
    imageUrl: user.imageUrl,
    metadata: structuredClone(user.metadata),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastLoginAt: toIso(user.lastLoginAt)
  };
}

export function serializeSession(session: Session): PublicAuthSession {
  return {
    id: session.id,
    userId: session.userId,
    createdAt: session.createdAt.toISOString(),
    lastActiveAt: session.lastActiveAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    idleExpiresAt: session.idleExpiresAt.toISOString(),
    ipAddress: session.ipAddress,
    userAgent: session.userAgent
  };
}

export function serializeAuthSession(input: {
  user: User;
  session: Session;
}): AuthSessionPayload {
  return {
    user: serializeUser(input.user),
    session: serializeSession(input.session)
  };
}

export function serializeDelivery(input: {
  sent: boolean;
  expiresAt: Date | null;
}): DeliveryPayload {
  return {
    sent: input.sent,
    expiresAt: toIso(input.expiresAt)
  };
}

export function serializeOrganisation(organisation: Organisation): PublicOrganisation {
  return {
    id: organisation.id,
    name: organisation.name,
    slug: organisation.slug
  };
}

export function serializeMember(member: OrganisationMember): PublicOrganisationMember {
  return {
    id: member.id,
    organisationId: member.organisationId,
    userId: member.userId,
    role: member.role,
    joinedAt: toIso(member.joinedAt)
  };
}

function toIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}
