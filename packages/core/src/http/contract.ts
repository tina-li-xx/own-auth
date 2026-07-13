import type { AuthErrorCode } from "../errors.js";

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

export interface AuthSessionPayload {
  user: PublicAuthUser;
  session: PublicAuthSession;
}

export interface DeliveryPayload {
  sent: boolean;
  expiresAt: string | null;
}

export interface OwnAuthEndpointInputMap {
  signUpEmailPassword: {
    email: string;
    password: string;
    name?: string;
  };
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
}

export interface OwnAuthEndpointOutputMap {
  signUpEmailPassword: AuthSessionPayload;
  signInEmailPassword: AuthSessionPayload;
  getSession: { session: AuthSessionPayload | null };
  signOut: { success: true };
  changePassword: { user: PublicAuthUser };
  requestMagicLink: DeliveryPayload;
  verifyMagicLink: AuthSessionPayload;
  requestEmailVerification: DeliveryPayload;
  verifyEmail: { user: PublicAuthUser };
  requestPasswordReset: DeliveryPayload;
  resetPassword: { user: PublicAuthUser };
  requestSmsOtp: DeliveryPayload;
  verifySmsOtp: {
    user: PublicAuthUser;
    session: PublicAuthSession | null;
  };
  acceptInvite: {
    organisation: PublicOrganisation;
    member: PublicOrganisationMember;
  };
}

export type OwnAuthEndpointId = keyof OwnAuthEndpointInputMap;
export type OwnAuthHttpErrorCode =
  | AuthErrorCode
  | "csrf_failed"
  | "invalid_request"
  | "method_not_allowed"
  | "not_found"
  | "internal_error";

export interface OwnAuthErrorPayload {
  error: {
    code: OwnAuthHttpErrorCode;
    message: string;
  };
}

export interface OwnAuthEndpointDefinition {
  id: OwnAuthEndpointId;
  method: OwnAuthHttpMethod;
  path: string;
  summary: string;
  request?: JsonSchema;
  response: JsonSchema;
  errors: readonly OwnAuthHttpErrorCode[];
  session: "none" | "optional" | "required" | "create" | "clear";
}

const stringSchema = (format?: string): JsonSchema => ({
  type: "string",
  minLength: 1,
  ...(format ? { format } : {})
});

const nullableStringSchema: JsonSchema = {
  anyOf: [{ type: "string" }, { type: "null" }]
};

const objectSchema = (
  properties: Record<string, JsonSchema>,
  required: readonly string[] = []
): JsonSchema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false
});

const emailSchema = stringSchema("email");
const emailRequestSchema = objectSchema({ email: emailSchema }, ["email"]);
const smsPurposeSchema: JsonSchema = {
  type: "string",
  enum: ["phone_login", "phone_verification", "account_recovery"]
};

export const publicAuthUserSchema = objectSchema(
  {
    id: stringSchema(),
    email: nullableStringSchema,
    emailVerifiedAt: nullableStringSchema,
    phone: nullableStringSchema,
    phoneVerifiedAt: nullableStringSchema,
    name: nullableStringSchema,
    imageUrl: nullableStringSchema,
    metadata: { type: "object", additionalProperties: true },
    createdAt: stringSchema("date-time"),
    updatedAt: stringSchema("date-time"),
    lastLoginAt: nullableStringSchema
  },
  [
    "id",
    "email",
    "emailVerifiedAt",
    "phone",
    "phoneVerifiedAt",
    "name",
    "imageUrl",
    "metadata",
    "createdAt",
    "updatedAt",
    "lastLoginAt"
  ]
);

export const publicAuthSessionSchema = objectSchema(
  {
    id: stringSchema(),
    userId: stringSchema(),
    createdAt: stringSchema("date-time"),
    lastActiveAt: stringSchema("date-time"),
    expiresAt: stringSchema("date-time"),
    idleExpiresAt: stringSchema("date-time"),
    ipAddress: nullableStringSchema,
    userAgent: nullableStringSchema
  },
  [
    "id",
    "userId",
    "createdAt",
    "lastActiveAt",
    "expiresAt",
    "idleExpiresAt",
    "ipAddress",
    "userAgent"
  ]
);

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

const authSessionSchema = objectSchema(
  { user: publicAuthUserSchema, session: publicAuthSessionSchema },
  ["user", "session"]
);

const userResponseSchema = objectSchema({ user: publicAuthUserSchema }, ["user"]);

const deliverySchema = objectSchema(
  { sent: { type: "boolean" }, expiresAt: nullableStringSchema },
  ["sent", "expiresAt"]
);

const emailPasswordSchema = objectSchema(
  { email: emailSchema, password: stringSchema() },
  ["email", "password"]
);

const tokenSchema = objectSchema({ token: stringSchema() }, ["token"]);
const deliveryErrors = ["rate_limited", "validation_error"] as const;
const tokenErrors = [
  "invalid_token",
  "expired_token",
  "token_already_used",
  "rate_limited"
] as const;

export const ownAuthEndpointContract: readonly OwnAuthEndpointDefinition[] = [
  {
    id: "signUpEmailPassword",
    method: "POST",
    path: "/sign-up/email",
    summary: "Create a user with an email and password",
    request: objectSchema(
      {
        email: emailSchema,
        password: stringSchema(),
        name: stringSchema()
      },
      ["email", "password"]
    ),
    response: authSessionSchema,
    errors: ["email_already_exists", "weak_password", "rate_limited", "validation_error"],
    session: "create"
  },
  {
    id: "signInEmailPassword",
    method: "POST",
    path: "/sign-in/email",
    summary: "Sign in with an email and password",
    request: emailPasswordSchema,
    response: authSessionSchema,
    errors: ["invalid_credentials", "disabled_user", "rate_limited", "validation_error"],
    session: "create"
  },
  {
    id: "getSession",
    method: "GET",
    path: "/session",
    summary: "Get the current session",
    response: objectSchema(
      { session: { anyOf: [authSessionSchema, { type: "null" }] } },
      ["session"]
    ),
    errors: [],
    session: "optional"
  },
  {
    id: "signOut",
    method: "POST",
    path: "/sign-out",
    summary: "Revoke the current session",
    response: objectSchema({ success: { const: true } }, ["success"]),
    errors: [],
    session: "clear"
  },
  {
    id: "changePassword",
    method: "POST",
    path: "/password/change",
    summary: "Change the current user's password",
    request: objectSchema(
      { currentPassword: stringSchema(), newPassword: stringSchema() },
      ["currentPassword", "newPassword"]
    ),
    response: userResponseSchema,
    errors: ["invalid_session", "invalid_credentials", "weak_password", "rate_limited"],
    session: "required"
  },
  {
    id: "requestMagicLink",
    method: "POST",
    path: "/magic-link/request",
    summary: "Send a magic link",
    request: objectSchema(
      { email: emailSchema, redirectUrl: stringSchema("uri-reference") },
      ["email"]
    ),
    response: deliverySchema,
    errors: [...deliveryErrors, "redirect_not_allowed"],
    session: "none"
  },
  {
    id: "verifyMagicLink",
    method: "POST",
    path: "/magic-link/verify",
    summary: "Verify a magic link and create a session",
    request: tokenSchema,
    response: authSessionSchema,
    errors: tokenErrors,
    session: "create"
  },
  {
    id: "requestEmailVerification",
    method: "POST",
    path: "/email-verification/request",
    summary: "Send an email verification link",
    request: emailRequestSchema,
    response: deliverySchema,
    errors: deliveryErrors,
    session: "none"
  },
  {
    id: "verifyEmail",
    method: "POST",
    path: "/email-verification/verify",
    summary: "Verify an email address",
    request: tokenSchema,
    response: userResponseSchema,
    errors: tokenErrors,
    session: "none"
  },
  {
    id: "requestPasswordReset",
    method: "POST",
    path: "/password-reset/request",
    summary: "Send a password reset link",
    request: emailRequestSchema,
    response: deliverySchema,
    errors: deliveryErrors,
    session: "none"
  },
  {
    id: "resetPassword",
    method: "POST",
    path: "/password-reset/confirm",
    summary: "Reset a password with a one-time token",
    request: objectSchema(
      { token: stringSchema(), newPassword: stringSchema() },
      ["token", "newPassword"]
    ),
    response: userResponseSchema,
    errors: [...tokenErrors, "weak_password"],
    session: "clear"
  },
  {
    id: "requestSmsOtp",
    method: "POST",
    path: "/sms/request",
    summary: "Send an SMS one-time code",
    request: objectSchema(
      {
        phone: stringSchema(),
        purpose: smsPurposeSchema
      },
      ["phone"]
    ),
    response: deliverySchema,
    errors: deliveryErrors,
    session: "optional"
  },
  {
    id: "verifySmsOtp",
    method: "POST",
    path: "/sms/verify",
    summary: "Verify an SMS one-time code",
    request: objectSchema(
      {
        phone: stringSchema(),
        code: stringSchema(),
        purpose: smsPurposeSchema
      },
      ["phone", "code"]
    ),
    response: objectSchema(
      {
        user: publicAuthUserSchema,
        session: { anyOf: [publicAuthSessionSchema, { type: "null" }] }
      },
      ["user", "session"]
    ),
    errors: ["invalid_otp", "otp_attempts_exceeded", "user_not_found", "rate_limited"],
    session: "optional"
  },
  {
    id: "acceptInvite",
    method: "POST",
    path: "/invitations/accept",
    summary: "Accept an organisation invitation",
    request: tokenSchema,
    response: objectSchema(
      {
        organisation: publicOrganisationSchema,
        member: publicOrganisationMemberSchema
      },
      ["organisation", "member"]
    ),
    errors: [...tokenErrors, "invalid_session", "permission_denied"],
    session: "required"
  }
];

export function getOwnAuthEndpoint<Id extends OwnAuthEndpointId>(
  id: Id
): OwnAuthEndpointDefinition & { id: Id } {
  const endpoint = ownAuthEndpointContract.find((candidate) => candidate.id === id);
  if (!endpoint) {
    throw new Error(`Unknown Own Auth endpoint: ${id}`);
  }
  return endpoint as OwnAuthEndpointDefinition & { id: Id };
}
