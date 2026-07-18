import type {
  AuditEvent,
  OrganisationMember,
  RequestContext,
  User
} from "./types.js";

export type ScimAccountLinking = "explicit" | "email";

export interface ScimOptions {
  requestLimit?: number;
  requestWindowMs?: number;
  failedAuthLimit?: number;
  failedAuthWindowMs?: number;
}

export interface ScimConnection {
  id: string;
  organisationId: string;
  key: string;
  name: string;
  defaultRole: string;
  accountLinking: ScimAccountLinking;
  samlConnectionId: string | null;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicScimConnection {
  id: string;
  organisationId: string;
  key: string;
  name: string;
  defaultRole: string;
  accountLinking: ScimAccountLinking;
  samlConnectionId: string | null;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScimToken {
  id: string;
  connectionId: string;
  name: string;
  prefix: string;
  tokenHash: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export type ScimTokenDetails = Omit<ScimToken, "tokenHash">;

export interface CreatedScimToken {
  token: ScimTokenDetails;
  rawToken: string;
}

export interface ScimUser {
  id: string;
  connectionId: string;
  userId: string;
  membershipId: string;
  externalId: string | null;
  userName: string;
  normalizedUserName: string;
  email: string | null;
  normalizedEmail: string | null;
  displayName: string | null;
  givenName: string | null;
  familyName: string | null;
  active: boolean;
  version: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScimUserAttributes {
  externalId?: string | null;
  userName: string;
  email?: string | null;
  displayName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  active?: boolean;
}

export type ScimUserFilter =
  | { attribute: "id"; value: string }
  | { attribute: "externalId"; value: string }
  | { attribute: "userName"; value: string };

export interface ScimUserPage {
  users: ScimUser[];
  totalResults: number;
}

export interface CreateScimConnectionInput {
  organisationId: string;
  actorUserId: string;
  name: string;
  defaultRole?: string;
  accountLinking?: ScimAccountLinking;
  samlConnectionId?: string | null;
  request?: RequestContext;
}

export interface UpdateScimConnectionInput {
  connectionId: string;
  actorUserId: string;
  name?: string;
  defaultRole?: string;
  accountLinking?: ScimAccountLinking;
  samlConnectionId?: string | null;
  request?: RequestContext;
}

export interface ScimConnectionAccessInput {
  connectionId: string;
  actorUserId: string;
  request?: RequestContext;
}

export interface ListScimConnectionsInput {
  organisationId: string;
  actorUserId: string;
}

export interface CreateScimTokenInput extends ScimConnectionAccessInput {
  name: string;
  expiresAt?: Date | null;
}

export interface RevokeScimTokenInput extends ScimConnectionAccessInput {
  tokenId: string;
}

export interface LinkScimUserInput extends ScimConnectionAccessInput, ScimUserAttributes {
  userId: string;
}

export interface RestoreScimUserInput extends ScimConnectionAccessInput {
  scimUserId: string;
}

export interface ScimProvisionCommit {
  user?: User;
  membership: OrganisationMember<string>;
  scimUser: ScimUser;
  auditEvents: readonly AuditEvent[];
}

export interface ScimUserMutation {
  id: string;
  expectedVersion: number;
  patch: Partial<ScimUser>;
  membershipPatch?: Partial<OrganisationMember<string>>;
  auditEvent?: AuditEvent;
}

export interface ScimEmailVerificationCommit {
  userId: string;
  normalizedEmail: string;
  verifiedAt: Date;
  auditEvent: AuditEvent;
}

export interface ScimRuntimeConfig {
  requestLimit: number;
  requestWindowMs: number;
  failedAuthLimit: number;
  failedAuthWindowMs: number;
}
