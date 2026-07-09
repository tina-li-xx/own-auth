import type { Permission } from "./permissions.js";
import type { AuthStorage } from "./storage.js";
import type {
  ApiKey,
  AuditEvent,
  CurrentSession,
  Invitation,
  Organisation,
  OrganisationMember,
  RequestContext,
  Session,
  User,
  VerifiedApiKey
} from "./types.js";
import type { RateLimitStore } from "./rate-limit.js";
import {
  createAuthEngineContext,
  type AuthEngineContext
} from "./auth-engine-internals.js";
import * as apiKeys from "./auth-engine-api-keys.js";
import * as email from "./auth-engine-email.js";
import * as invitations from "./auth-engine-invitations.js";
import * as organisations from "./auth-engine-organisations.js";
import * as sessions from "./auth-engine-sessions.js";
import * as sms from "./auth-engine-sms.js";
import * as users from "./auth-engine-users.js";
import type {
  AcceptInvitationInput,
  ApiKeyListFilter,
  AuditEventFilter,
  ChangeMemberRoleInput,
  ChangePasswordInput,
  CreateApiKeyInput,
  CreatedApiKey,
  CreateOrganisationInput,
  CreateUserInput,
  DeliveryResult,
  InvitationResult,
  InviteMemberInput,
  OwnAuthOptions,
  RemoveMemberInput,
  RequestEmailVerificationInput,
  RequestSmsOtpInput,
  RequestTokenInput,
  ResetPasswordInput,
  RevokeInvitationInput,
  SessionResult,
  SignInEmailPasswordInput,
  SignUpEmailPasswordInput,
  SmsOtpVerificationResult,
  UpdateOrganisationInput,
  UserStatusInput,
  VerifySmsOtpInput,
  VerifyTokenInput
} from "./auth-engine-types.js";

export type { OwnAuthOptions } from "./auth-engine-types.js";

export class OwnAuth {
  readonly storage: AuthStorage;
  readonly rateLimitStore: RateLimitStore;
  private readonly ctx: AuthEngineContext;

  constructor(options: OwnAuthOptions = {}) {
    this.ctx = createAuthEngineContext(options);
    this.storage = this.ctx.storage;
    this.rateLimitStore = this.ctx.rateLimitStore;
  }

  createUser(input: CreateUserInput): Promise<User> { return users.createUser(this.ctx, input); }
  signUpEmailPassword(input: SignUpEmailPasswordInput): Promise<SessionResult> { return users.signUpEmailPassword(this.ctx, input); }
  signInEmailPassword(input: SignInEmailPasswordInput): Promise<SessionResult> { return users.signInEmailPassword(this.ctx, input); }
  changePassword(input: ChangePasswordInput): Promise<User> { return users.changePassword(this.ctx, input); }
  getCurrentSession(sessionToken: string): Promise<CurrentSession | null> { return sessions.getCurrentSession(this.ctx, sessionToken); }
  requireCurrentSession(sessionToken: string): Promise<CurrentSession> { return sessions.requireCurrentSession(this.ctx, sessionToken); }
  signOut(sessionToken: string, context?: RequestContext): Promise<void> { return sessions.signOut(this.ctx, sessionToken, context); }
  revokeAllSessions(userId: string, reason = "all_sessions_revoked"): Promise<number> { return sessions.revokeAllSessions(this.ctx, userId, reason); }
  requestMagicLink(input: RequestTokenInput): Promise<DeliveryResult> { return email.requestMagicLink(this.ctx, input); }
  verifyMagicLink(input: VerifyTokenInput): Promise<SessionResult> { return email.verifyMagicLink(this.ctx, input); }
  requestEmailVerification(input: RequestEmailVerificationInput): Promise<DeliveryResult> {
    return email.requestEmailVerification(this.ctx, input);
  }
  verifyEmail(input: VerifyTokenInput): Promise<User> { return email.verifyEmail(this.ctx, input); }
  requestPasswordReset(input: RequestEmailVerificationInput): Promise<DeliveryResult> {
    return email.requestPasswordReset(this.ctx, input);
  }
  resetPassword(input: ResetPasswordInput): Promise<User> { return email.resetPassword(this.ctx, input); }
  requestSmsOtp(input: RequestSmsOtpInput): Promise<DeliveryResult> { return sms.requestSmsOtp(this.ctx, input); }
  verifySmsOtp(input: VerifySmsOtpInput): Promise<SmsOtpVerificationResult> { return sms.verifySmsOtp(this.ctx, input); }
  createApiKey(input: CreateApiKeyInput): Promise<CreatedApiKey> { return apiKeys.createApiKey(this.ctx, input); }
  verifyApiKey(rawKey: string, requiredScopes: string[] = []): Promise<VerifiedApiKey> { return apiKeys.verifyApiKey(this.ctx, rawKey, requiredScopes); }
  revokeApiKey(
    keyPrefixOrId: string,
    revokedBy?: string,
    context?: RequestContext
  ): Promise<ApiKey> {
    return apiKeys.revokeApiKey(this.ctx, keyPrefixOrId, revokedBy, context);
  }
  createOrganisation(input: CreateOrganisationInput): Promise<{
    organisation: Organisation;
    ownerMembership: OrganisationMember;
  }> {
    return organisations.createOrganisation(this.ctx, input);
  }
  updateOrganisation(organisationId: string, input: UpdateOrganisationInput): Promise<Organisation> {
    return organisations.updateOrganisation(this.ctx, organisationId, input);
  }
  inviteMember(input: InviteMemberInput): Promise<InvitationResult> { return invitations.inviteMember(this.ctx, input); }
  acceptInvitation(
    input: AcceptInvitationInput
  ): Promise<{ invitation: Invitation; user: User; member: OrganisationMember }> {
    return invitations.acceptInvitation(this.ctx, input);
  }
  changeMemberRole(input: ChangeMemberRoleInput): Promise<OrganisationMember> { return organisations.changeMemberRole(this.ctx, input); }
  removeMember(input: RemoveMemberInput): Promise<OrganisationMember> { return organisations.removeMember(this.ctx, input); }
  checkPermission(
    organisationId: string,
    userId: string,
    permission: Permission
  ): Promise<boolean> {
    return organisations.checkPermission(this.ctx, organisationId, userId, permission);
  }
  requirePermission(
    organisationId: string,
    userId: string,
    permission: Permission
  ): Promise<OrganisationMember> {
    return organisations.requirePermission(this.ctx, organisationId, userId, permission);
  }
  disableUser(input: UserStatusInput): Promise<User> { return users.disableUser(this.ctx, input); }
  enableUser(input: UserStatusInput): Promise<User> { return users.enableUser(this.ctx, input); }
  revokeInvitation(input: RevokeInvitationInput): Promise<Invitation> { return invitations.revokeInvitation(this.ctx, input); }
  listSessions(userId: string): Promise<Session[]> { return sessions.listSessions(this.ctx, userId); }
  listApiKeys(filter: ApiKeyListFilter): Promise<ApiKey[]> { return apiKeys.listApiKeys(this.ctx, filter); }
  listOrganisations(userId: string): Promise<Organisation[]> { return organisations.listOrganisations(this.ctx, userId); }
  listInvitations(organisationId: string): Promise<Invitation[]> { return invitations.listInvitations(this.ctx, organisationId); }
  listAuditEvents(filter?: AuditEventFilter): Promise<AuditEvent[]> { return this.storage.listAuditEvents(filter); }
}

export function createOwnAuth(options?: OwnAuthOptions): OwnAuth {
  return new OwnAuth(options);
}
