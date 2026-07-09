export { OwnAuth, createOwnAuth } from "./auth-engine.js";
export type {
  CreateApiKeyInput,
  ChangePasswordInput,
  CreatedApiKey,
  CreateOrganisationInput,
  CreateUserInput,
  DeliveryResult,
  InvitationResult,
  InviteMemberInput,
  OwnAuthOptions,
  RequestEmailVerificationInput,
  RequestSmsOtpInput,
  RequestTokenInput,
  ResetPasswordInput,
  SessionResult,
  SignInEmailPasswordInput,
  SignUpEmailPasswordInput,
  SmsOtpVerificationResult,
  VerifySmsOtpInput,
  VerifyTokenInput
} from "./auth-engine-types.js";
export { AuthError, toAuthError } from "./errors.js";
export type { AuthErrorCode } from "./errors.js";
export { InMemoryAuthStorage } from "./memory-storage.js";
export type { AuthStorage } from "./storage.js";
export {
  InMemoryRateLimitStore,
  enforceRateLimit
} from "./rate-limit.js";
export type { RateLimitResult, RateLimitStore } from "./rate-limit.js";
export {
  ConsoleEmailProvider,
  ConsoleSmsProvider,
  MemoryEmailProvider,
  MemorySmsProvider,
  OwnAuthManagedEmailProvider
} from "./providers.js";
export type {
  EmailMessage,
  EmailProvider,
  OwnAuthManagedEmailProviderOptions,
  SmsMessage,
  SmsProvider
} from "./providers.js";
export {
  permissionsForRole,
  roleHasPermission
} from "./permissions.js";
export type { Permission } from "./permissions.js";
export type {
  Account,
  AccountProvider,
  ApiKey,
  ApiKeyStatus,
  AuditEvent,
  AuditEventType,
  AuthToken,
  CurrentSession,
  Invitation,
  InvitationStatus,
  JsonRecord,
  MemberStatus,
  Organisation,
  OrganisationMember,
  OrganisationRole,
  RequestContext,
  Session,
  SmsOtp,
  SmsOtpPurpose,
  TokenType,
  User,
  VerifiedApiKey
} from "./types.js";
