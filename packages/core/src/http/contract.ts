import {
  authSessionSchema,
  nullableStringSchema,
  objectSchema,
  openObjectSchema,
  publicAuthUserSchema,
  publicPasskeySchema,
  signInSchema,
  stringSchema
} from "./contract-schemas.js";
import type {
  JsonSchema,
  OwnAuthEndpointDefinition,
  OwnAuthEndpointId
} from "./contract-types.js";
import { externalAccountProviders } from "../oauth-types.js";

export * from "./contract-schemas.js";
export type * from "./contract-types.js";

const emailSchema = stringSchema("email");
const emailRequestSchema = objectSchema({ email: emailSchema }, ["email"]);
const tokenSchema = objectSchema({ token: stringSchema() }, ["token"]);
const successSchema = objectSchema({ success: { const: true } }, ["success"]);
const userResponseSchema = objectSchema({ user: publicAuthUserSchema }, ["user"]);
const deliverySchema = objectSchema(
  { sent: { type: "boolean" }, expiresAt: nullableStringSchema },
  ["sent", "expiresAt"]
);
const smsPurposeSchema: JsonSchema = {
  type: "string",
  enum: ["phone_login", "phone_verification", "account_recovery"]
};
const oauthProviderSchema: JsonSchema = {
  type: "string",
  enum: externalAccountProviders
};
const publicOrganisationSchema = objectSchema(
  { id: stringSchema(), name: stringSchema(), slug: stringSchema() },
  ["id", "name", "slug"]
);
const publicOrganisationMemberSchema = objectSchema(
  {
    id: stringSchema(),
    organisationId: stringSchema(),
    userId: stringSchema(),
    role: { type: "string", enum: ["owner", "admin", "member"] },
    joinedAt: nullableStringSchema
  },
  ["id", "organisationId", "userId", "role", "joinedAt"]
);
const oauthCallbackSchema = objectSchema(
  { status: { type: "string", enum: ["complete", "mfa_required", "linked"] } },
  ["status"]
);
const oauthCallbackRequestSchema = objectSchema(
  {
    code: stringSchema(),
    state: stringSchema(),
    error: stringSchema(),
    error_description: stringSchema(),
    id_token: stringSchema(),
    user: stringSchema()
  },
  [],
  true
);
const passkeyResponseSchema = objectSchema({ response: openObjectSchema, name: stringSchema() }, ["response"]);
const deliveryErrors = ["rate_limited", "validation_error"] as const;
const tokenErrors = ["invalid_token", "expired_token", "token_already_used", "rate_limited"] as const;
const oauthErrors = [
  "oauth_transaction_invalid",
  "oauth_provider_error",
  "account_linking_required",
  "oauth_account_conflict",
  "oauth_verified_email_required",
  "rate_limited"
] as const;
const mfaErrors = [
  "mfa_challenge_invalid",
  "mfa_code_invalid",
  "mfa_timestep_reused",
  "rate_limited"
] as const;

export const ownAuthEndpointContract: readonly OwnAuthEndpointDefinition[] = [
  endpoint("signUpEmailPassword", "POST", "/sign-up/email", "Create a user with an email and password", {
    request: objectSchema(
      { email: emailSchema, password: stringSchema(), name: stringSchema() },
      ["email", "password"]
    ),
    response: authSessionSchema,
    errors: ["email_already_exists", "weak_password", "rate_limited", "validation_error"],
    session: "create"
  }),
  endpoint("signInEmailPassword", "POST", "/sign-in/email", "Sign in with an email and password", {
    request: objectSchema({ email: emailSchema, password: stringSchema() }, ["email", "password"]),
    response: signInSchema,
    errors: ["invalid_credentials", "disabled_user", "rate_limited", "validation_error"],
    session: "create"
  }),
  endpoint("getSession", "GET", "/session", "Get the current session", {
    response: objectSchema({ session: { anyOf: [authSessionSchema, { type: "null" }] } }, ["session"]),
    errors: [], session: "optional"
  }),
  endpoint("signOut", "POST", "/sign-out", "Revoke the current session", {
    response: successSchema, errors: [], session: "clear"
  }),
  endpoint("changePassword", "POST", "/password/change", "Change the current user's password", {
    request: objectSchema(
      { currentPassword: stringSchema(), newPassword: stringSchema() },
      ["currentPassword", "newPassword"]
    ),
    response: userResponseSchema,
    errors: ["invalid_session", "invalid_credentials", "weak_password", "rate_limited"],
    session: "required"
  }),
  endpoint("requestMagicLink", "POST", "/magic-link/request", "Send a magic link", {
    request: objectSchema({ email: emailSchema, redirectUrl: stringSchema("uri-reference") }, ["email"]),
    response: deliverySchema, errors: [...deliveryErrors, "redirect_not_allowed"], session: "none"
  }),
  endpoint("verifyMagicLink", "POST", "/magic-link/verify", "Verify a magic link", {
    request: tokenSchema, response: signInSchema, errors: tokenErrors, session: "create"
  }),
  endpoint("requestEmailVerification", "POST", "/email-verification/request", "Send an email verification link", {
    request: emailRequestSchema, response: deliverySchema, errors: deliveryErrors, session: "none"
  }),
  endpoint("verifyEmail", "POST", "/email-verification/verify", "Verify an email address", {
    request: tokenSchema, response: userResponseSchema, errors: tokenErrors, session: "none"
  }),
  endpoint("requestPasswordReset", "POST", "/password-reset/request", "Send a password reset link", {
    request: emailRequestSchema, response: deliverySchema, errors: deliveryErrors, session: "none"
  }),
  endpoint("resetPassword", "POST", "/password-reset/confirm", "Reset a password", {
    request: objectSchema({ token: stringSchema(), newPassword: stringSchema() }, ["token", "newPassword"]),
    response: userResponseSchema, errors: [...tokenErrors, "weak_password"], session: "clear"
  }),
  endpoint("requestSmsOtp", "POST", "/sms/request", "Send an SMS one-time code", {
    request: objectSchema({ phone: stringSchema(), purpose: smsPurposeSchema }, ["phone"]),
    response: deliverySchema, errors: deliveryErrors, session: "optional"
  }),
  endpoint("verifySmsOtp", "POST", "/sms/verify", "Verify an SMS one-time code", {
    request: objectSchema(
      { phone: stringSchema(), code: stringSchema(), purpose: smsPurposeSchema },
      ["phone", "code"]
    ),
    response: { anyOf: [signInSchema, objectSchema({ status: { const: "verified" }, user: publicAuthUserSchema }, ["status", "user"])] },
    errors: ["invalid_otp", "otp_attempts_exceeded", "user_not_found", "rate_limited"],
    session: "optional"
  }),
  endpoint("acceptInvite", "POST", "/invitations/accept", "Accept an organisation invitation", {
    request: tokenSchema,
    response: objectSchema(
      { organisation: publicOrganisationSchema, member: publicOrganisationMemberSchema },
      ["organisation", "member"]
    ),
    errors: [...tokenErrors, "invalid_session", "permission_denied"], session: "required"
  }),
  endpoint("oauthStart", "POST", "/oauth/start", "Start OAuth authorization", {
    request: objectSchema({
      provider: oauthProviderSchema,
      intent: { type: "string", enum: ["sign_in", "link"] },
      destination: stringSchema("uri-reference"),
      mode: { type: "string", enum: ["redirect", "popup"] },
      openerOrigin: stringSchema("uri")
    }, ["provider"]),
    response: objectSchema({ url: stringSchema("uri"), expiresAt: stringSchema("date-time") }, ["url", "expiresAt"]),
    errors: ["redirect_not_allowed", "rate_limited", "validation_error"], session: "optional"
  }),
  oauthCallback("oauthGoogleCallback", "GET", "/oauth/google/callback", "Complete Google OAuth"),
  oauthCallback("oauthGitHubCallback", "GET", "/oauth/github/callback", "Complete GitHub OAuth"),
  oauthCallback("oauthAppleCallback", "GET", "/oauth/apple/callback", "Complete Apple OAuth"),
  oauthCallback("oauthAppleCallbackPost", "POST", "/oauth/apple/callback", "Complete Apple form-post OAuth", "form"),
  endpoint("prepareGoogleOneTap", "POST", "/oauth/google/one-tap/prepare", "Prepare Google One Tap", {
    response: objectSchema({ nonce: stringSchema(), expiresAt: stringSchema("date-time") }, ["nonce", "expiresAt"]),
    errors: ["rate_limited", "validation_error"], session: "none"
  }),
  endpoint("signInGoogleOneTap", "POST", "/oauth/google/one-tap/verify", "Verify Google One Tap", {
    request: objectSchema({ credential: stringSchema(), nonce: stringSchema() }, ["credential", "nonce"]),
    response: signInSchema, errors: oauthErrors, session: "create"
  }),
  endpoint("unlinkOAuthProvider", "POST", "/oauth/unlink", "Unlink an OAuth provider", {
    request: objectSchema({ provider: oauthProviderSchema, providerAccountId: stringSchema() }, ["provider", "providerAccountId"]),
    response: successSchema,
    errors: ["invalid_session", "authentication_method_required", "invalid_credentials"],
    session: "required"
  }),
  endpoint("completeMfaTotp", "POST", "/mfa/totp/complete", "Complete MFA with TOTP", {
    request: objectSchema({ code: stringSchema() }, ["code"]), response: authSessionSchema,
    errors: mfaErrors, session: "create"
  }),
  endpoint("completeMfaRecovery", "POST", "/mfa/recovery/complete", "Complete MFA with a recovery code", {
    request: objectSchema({ code: stringSchema() }, ["code"]), response: authSessionSchema,
    errors: mfaErrors, session: "create"
  }),
  endpoint("beginTotpEnrollment", "POST", "/mfa/totp/enroll", "Begin TOTP enrollment", {
    response: objectSchema({ factorId: stringSchema(), secret: stringSchema(), uri: stringSchema("uri") }, ["factorId", "secret", "uri"]),
    errors: ["invalid_session", "encryption_not_configured"], session: "required"
  }),
  endpoint("confirmTotpEnrollment", "POST", "/mfa/totp/confirm", "Confirm TOTP enrollment", {
    request: objectSchema({ factorId: stringSchema(), code: stringSchema() }, ["factorId", "code"]),
    response: objectSchema({ recoveryCodes: { type: "array", items: stringSchema() } }, ["recoveryCodes"]),
    errors: ["invalid_session", "mfa_code_invalid"], session: "required"
  }),
  endpoint("disableTotp", "POST", "/mfa/totp/disable", "Disable TOTP", {
    request: objectSchema({ code: stringSchema() }, ["code"]), response: successSchema,
    errors: ["invalid_session", "mfa_code_invalid", "mfa_timestep_reused"], session: "required"
  }),
  endpoint("regenerateRecoveryCodes", "POST", "/mfa/recovery/regenerate", "Regenerate recovery codes", {
    request: objectSchema({ code: stringSchema() }, ["code"]),
    response: objectSchema({ recoveryCodes: { type: "array", items: stringSchema() } }, ["recoveryCodes"]),
    errors: ["invalid_session", "mfa_code_invalid", "mfa_timestep_reused"], session: "required"
  }),
  endpoint("beginPasskeyRegistration", "POST", "/passkeys/register/options", "Create passkey registration options", {
    response: objectSchema({ options: openObjectSchema }, ["options"]), errors: ["invalid_session", "validation_error"], session: "required"
  }),
  endpoint("completePasskeyRegistration", "POST", "/passkeys/register/verify", "Verify passkey registration", {
    request: passkeyResponseSchema,
    response: objectSchema({ passkey: publicPasskeySchema }, ["passkey"]),
    errors: ["invalid_session", "passkey_invalid"], session: "required"
  }),
  endpoint("beginPasskeyAuthentication", "POST", "/passkeys/authenticate/options", "Create passkey authentication options", {
    request: objectSchema({ userId: stringSchema(), mfa: { type: "boolean" } }),
    response: objectSchema({ options: openObjectSchema }, ["options"]),
    errors: ["passkey_not_found", "mfa_challenge_invalid", "validation_error"], session: "optional"
  }),
  endpoint("completePasskeyAuthentication", "POST", "/passkeys/authenticate/verify", "Verify passkey authentication", {
    request: objectSchema({ response: openObjectSchema }, ["response"]), response: authSessionSchema,
    errors: ["passkey_invalid", "mfa_challenge_invalid"], session: "create"
  }),
  endpoint("listPasskeys", "GET", "/passkeys", "List passkeys", {
    response: objectSchema({ passkeys: { type: "array", items: publicPasskeySchema } }, ["passkeys"]),
    errors: ["invalid_session"], session: "required"
  }),
  endpoint("renamePasskey", "POST", "/passkeys/rename", "Rename a passkey", {
    request: objectSchema({ passkeyId: stringSchema(), name: stringSchema() }, ["passkeyId", "name"]),
    response: objectSchema({ passkey: publicPasskeySchema }, ["passkey"]),
    errors: ["invalid_session", "passkey_not_found", "validation_error"], session: "required"
  }),
  endpoint("revokePasskey", "POST", "/passkeys/revoke", "Revoke a passkey", {
    request: objectSchema({ passkeyId: stringSchema() }, ["passkeyId"]), response: successSchema,
    errors: ["invalid_session", "passkey_not_found", "authentication_method_required"], session: "required"
  })
];

export function getOwnAuthEndpoint<Id extends OwnAuthEndpointId>(
  id: Id
): OwnAuthEndpointDefinition & { id: Id } {
  const endpointDefinition = ownAuthEndpointContract.find((candidate) => candidate.id === id);
  if (!endpointDefinition) throw new Error(`Unknown Own Auth endpoint: ${id}`);
  return endpointDefinition as OwnAuthEndpointDefinition & { id: Id };
}

function endpoint<Id extends OwnAuthEndpointId>(
  id: Id,
  method: "GET" | "POST",
  path: string,
  summary: string,
  rest: Omit<OwnAuthEndpointDefinition, "id" | "method" | "path" | "summary">
): OwnAuthEndpointDefinition {
  return { id, method, path, summary, ...rest };
}

function oauthCallback(
  id: "oauthGoogleCallback" | "oauthGitHubCallback" | "oauthAppleCallback" | "oauthAppleCallbackPost",
  method: "GET" | "POST",
  path: string,
  summary: string,
  requestTransport: "query" | "form" = "query"
): OwnAuthEndpointDefinition {
  return endpoint(id, method, path, summary, {
    request: oauthCallbackRequestSchema,
    requestTransport,
    response: oauthCallbackSchema,
    responseKind: "oauth_callback",
    errors: oauthErrors,
    session: "create",
    csrf: "oauth_state"
  });
}
