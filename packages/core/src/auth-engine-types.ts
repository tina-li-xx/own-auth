import type {
  ApiKey,
  Invitation,
  JsonRecord,
  Organisation,
  OrganisationMember,
  OrganisationRole,
  RequestContext,
  Session,
  SmsOtpPurpose,
  User
} from "./types.js";
export { day, defaultTokenTtls, hour, minute } from "./auth-engine-options.js";
export type { OwnAuthOptions, TokenTtlConfig } from "./auth-engine-options.js";

export interface SessionResult {
  user: User;
  session: Session;
  sessionToken: string;
}

export interface DeliveryResult {
  sent: boolean;
  expiresAt: Date | null;
  token?: string;
  code?: string;
  url?: string;
}

export interface CreateUserInput {
  email?: string;
  phone?: string;
  password?: string;
  name?: string;
  imageUrl?: string;
  metadata?: JsonRecord;
}

export interface SignUpEmailPasswordInput {
  email: string;
  password: string;
  name?: string;
  metadata?: JsonRecord;
  request?: RequestContext;
}

export interface SignInEmailPasswordInput {
  email: string;
  password: string;
  request?: RequestContext;
}

export interface RequestTokenInput {
  email: string;
  redirectUrl?: string;
  request?: RequestContext;
}

export interface RequestEmailVerificationInput {
  email: string;
  request?: RequestContext;
}

export interface VerifyTokenInput {
  token: string;
  request?: RequestContext;
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
  request?: RequestContext;
}

export interface RequestSmsOtpInput {
  phone: string;
  purpose?: SmsOtpPurpose;
  userId?: string;
  request?: RequestContext;
}

export interface VerifySmsOtpInput {
  phone: string;
  code: string;
  purpose?: SmsOtpPurpose;
  request?: RequestContext;
}

export interface SmsOtpVerificationResult {
  user: User;
  session: Session | null;
  sessionToken: string | null;
}

export interface CreateApiKeyInput {
  name: string;
  userId?: string;
  organisationId?: string;
  scopes?: string[];
  expiresAt?: Date;
  metadata?: JsonRecord;
  actorUserId?: string;
  request?: RequestContext;
}

export interface CreatedApiKey {
  apiKey: ApiKey;
  rawKey: string;
}

export interface CreateOrganisationInput {
  name: string;
  slug?: string;
  ownerUserId: string;
  metadata?: JsonRecord;
  request?: RequestContext;
}

export interface InviteMemberInput {
  organisationId: string;
  email: string;
  role?: OrganisationRole;
  invitedByUserId: string;
  request?: RequestContext;
}

export interface InvitationResult {
  invitation: Invitation;
  token?: string;
  url?: string;
}

export interface UpdateOrganisationInput {
  actorUserId: string;
  name?: string;
  slug?: string;
  metadata?: JsonRecord;
  request?: RequestContext;
}

export interface AcceptInvitationInput {
  token: string;
  userId?: string;
  request?: RequestContext;
}

export interface ChangeMemberRoleInput {
  organisationId: string;
  memberId: string;
  role: OrganisationRole;
  actorUserId: string;
  request?: RequestContext;
}

export interface RemoveMemberInput {
  organisationId: string;
  memberId: string;
  actorUserId: string;
  request?: RequestContext;
}

export interface UserStatusInput {
  userId: string;
  actorUserId: string;
  request?: RequestContext;
}

export interface RevokeInvitationInput {
  invitationId: string;
  actorUserId: string;
  request?: RequestContext;
}

export interface ApiKeyListFilter {
  userId?: string;
  organisationId?: string;
}

export interface AuditEventFilter {
  userId?: string;
  organisationId?: string;
  apiKeyId?: string;
}
