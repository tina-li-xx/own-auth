import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON
} from "@simplewebauthn/server";
import type { AuthErrorCode } from "../errors.js";
import type { MfaMethod } from "../identity-types.js";
import type { ExternalAccountProvider, SessionAssuranceLevel } from "../types.js";

export type OwnAuthHttpMethod = "GET" | "POST";
export type JsonSchema = Readonly<Record<string, unknown>>;

export interface PublicAuthUser {
  id: string;
  email: string | null;
  emailVerifiedAt: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  name: string | null;
  imageUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface PublicAuthSession {
  id: string;
  userId: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  idleExpiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  authenticationMethods: string[];
  assuranceLevel: SessionAssuranceLevel;
  authenticatedAt: string;
}

export interface PublicOrganisation {
  id: string;
  name: string;
  slug: string;
}

export interface PublicOrganisationMember {
  id: string;
  organisationId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  joinedAt: string | null;
}

export interface PublicPasskey {
  id: string;
  name: string;
  discoverable: boolean;
  deviceType: "singleDevice" | "multiDevice";
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface AuthSessionPayload {
  status: "complete";
  user: PublicAuthUser;
  session: PublicAuthSession;
}

export interface MfaRequiredPayload {
  status: "mfa_required";
  methods: MfaMethod[];
  expiresAt: string;
}

export type SignInPayload = AuthSessionPayload | MfaRequiredPayload;

export interface DeliveryPayload {
  sent: boolean;
  expiresAt: string | null;
}

export interface OwnAuthEndpointInputMap {
  signUpEmailPassword: { email: string; password: string; name?: string };
  signInEmailPassword: { email: string; password: string };
  getSession: undefined;
  signOut: undefined;
  changePassword: { currentPassword: string; newPassword: string };
  requestMagicLink: { email: string; redirectUrl?: string };
  verifyMagicLink: { token: string };
  requestEmailVerification: { email: string };
  verifyEmail: { token: string };
  requestPasswordReset: { email: string };
  resetPassword: { token: string; newPassword: string };
  requestSmsOtp: {
    phone: string;
    purpose?: "phone_login" | "phone_verification" | "account_recovery";
  };
  verifySmsOtp: {
    phone: string;
    code: string;
    purpose?: "phone_login" | "phone_verification" | "account_recovery";
  };
  acceptInvite: { token: string };
  oauthStart: {
    provider: ExternalAccountProvider;
    intent?: "sign_in" | "link";
    destination?: string;
    mode?: "redirect" | "popup";
    openerOrigin?: string;
  };
  oauthGoogleCallback: Record<string, string>;
  oauthGitHubCallback: Record<string, string>;
  oauthAppleCallback: Record<string, string>;
  oauthAppleCallbackPost: Record<string, string>;
  prepareGoogleOneTap: undefined;
  signInGoogleOneTap: { credential: string; nonce: string };
  unlinkOAuthProvider: { provider: ExternalAccountProvider; providerAccountId: string };
  completeMfaTotp: { code: string };
  completeMfaRecovery: { code: string };
  beginTotpEnrollment: undefined;
  confirmTotpEnrollment: { factorId: string; code: string };
  disableTotp: { code: string };
  regenerateRecoveryCodes: { code: string };
  beginPasskeyRegistration: undefined;
  completePasskeyRegistration: { response: RegistrationResponseJSON; name?: string };
  beginPasskeyAuthentication: { userId?: string; mfa?: boolean };
  completePasskeyAuthentication: { response: AuthenticationResponseJSON };
  listPasskeys: undefined;
  renamePasskey: { passkeyId: string; name: string };
  revokePasskey: { passkeyId: string };
}

export interface OwnAuthEndpointOutputMap {
  signUpEmailPassword: AuthSessionPayload;
  signInEmailPassword: SignInPayload;
  getSession: { session: AuthSessionPayload | null };
  signOut: { success: true };
  changePassword: { user: PublicAuthUser };
  requestMagicLink: DeliveryPayload;
  verifyMagicLink: SignInPayload;
  requestEmailVerification: DeliveryPayload;
  verifyEmail: { user: PublicAuthUser };
  requestPasswordReset: DeliveryPayload;
  resetPassword: { user: PublicAuthUser };
  requestSmsOtp: DeliveryPayload;
  verifySmsOtp: SignInPayload | { status: "verified"; user: PublicAuthUser };
  acceptInvite: { organisation: PublicOrganisation; member: PublicOrganisationMember };
  oauthStart: { url: string; expiresAt: string };
  oauthGoogleCallback: { status: "complete" | "mfa_required" | "linked" };
  oauthGitHubCallback: { status: "complete" | "mfa_required" | "linked" };
  oauthAppleCallback: { status: "complete" | "mfa_required" | "linked" };
  oauthAppleCallbackPost: { status: "complete" | "mfa_required" | "linked" };
  prepareGoogleOneTap: { nonce: string; expiresAt: string };
  signInGoogleOneTap: SignInPayload;
  unlinkOAuthProvider: { success: true };
  completeMfaTotp: AuthSessionPayload;
  completeMfaRecovery: AuthSessionPayload;
  beginTotpEnrollment: { factorId: string; secret: string; uri: string };
  confirmTotpEnrollment: { recoveryCodes: string[] };
  disableTotp: { success: true };
  regenerateRecoveryCodes: { recoveryCodes: string[] };
  beginPasskeyRegistration: { options: PublicKeyCredentialCreationOptionsJSON };
  completePasskeyRegistration: { passkey: PublicPasskey };
  beginPasskeyAuthentication: { options: PublicKeyCredentialRequestOptionsJSON };
  completePasskeyAuthentication: AuthSessionPayload;
  listPasskeys: { passkeys: PublicPasskey[] };
  renamePasskey: { passkey: PublicPasskey };
  revokePasskey: { success: true };
}

export type OwnAuthEndpointId = keyof OwnAuthEndpointInputMap;
export type OwnAuthHttpErrorCode =
  | AuthErrorCode
  | "csrf_failed"
  | "invalid_request"
  | "method_not_allowed"
  | "not_found"
  | "internal_error"
  | `plugin.${string}`;

export interface OwnAuthErrorPayload {
  error: { code: OwnAuthHttpErrorCode; message: string };
}

export interface OwnAuthEndpointDefinition {
  id: OwnAuthEndpointId;
  method: OwnAuthHttpMethod;
  path: string;
  summary: string;
  request?: JsonSchema;
  requestTransport?: "json" | "query" | "form";
  response: JsonSchema;
  responseKind?: "json" | "oauth_callback";
  errors: readonly OwnAuthHttpErrorCode[];
  session: "none" | "optional" | "required" | "create" | "clear";
  csrf?: "default" | "oauth_state";
}
