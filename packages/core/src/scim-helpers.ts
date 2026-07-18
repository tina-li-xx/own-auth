import { AuthError } from "./errors.js";
import { normalizeEmail } from "./normalise.js";
import type { AuthEngineContext } from "./auth-engine-context.js";
import type {
  PublicScimConnection,
  ScimAccountLinking,
  ScimConnection,
  ScimToken,
  ScimTokenDetails,
  ScimUserAttributes
} from "./scim-types.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function requireScim(ctx: AuthEngineContext) {
  if (!ctx.scim || !ctx.scimStorage) {
    throw new AuthError("scim_not_configured", "SCIM is not configured", 404);
  }
  return { config: ctx.scim, storage: ctx.scimStorage };
}

export async function requireScimConnection(
  ctx: AuthEngineContext,
  connectionId: string,
  allowDisabled = false
): Promise<ScimConnection> {
  const { storage } = requireScim(ctx);
  const connection = await storage.getConnectionById(connectionId);
  if (!connection) {
    throw new AuthError("scim_connection_not_found", "SCIM connection not found", 404);
  }
  if (!allowDisabled && connection.disabledAt) {
    throw new AuthError("scim_connection_disabled", "SCIM connection is disabled", 403);
  }
  const organisation = await ctx.storage.getOrganisationById(connection.organisationId);
  if (!organisation || organisation.disabledAt) {
    throw new AuthError("scim_connection_disabled", "SCIM connection is disabled", 403);
  }
  return connection;
}

export function requireScimRole(ctx: AuthEngineContext, role: string): string {
  const normalized = role.trim();
  if (normalized === "owner" || !ctx.authorization.hasRole(normalized)) {
    throw new AuthError("role_not_configured", "SCIM requires a configured non-owner role", 409);
  }
  return normalized;
}

export function requireScimAccountLinking(value: ScimAccountLinking): ScimAccountLinking {
  if (value !== "explicit" && value !== "email") {
    throw new AuthError("validation_error", "SCIM account-linking mode is invalid", 400);
  }
  return value;
}

export function publicScimConnection(connection: ScimConnection): PublicScimConnection {
  return { ...connection };
}

export function publicScimToken(token: ScimToken): ScimTokenDetails {
  const { tokenHash: _tokenHash, ...details } = token;
  return details;
}

export function normalizeScimUserName(value: string): string {
  return bounded(value, "userName", 320).normalize("NFC").toLowerCase();
}

export function normalizeScimAttributes(input: ScimUserAttributes): Required<ScimUserAttributes> {
  const userName = bounded(input.userName, "userName", 320).normalize("NFC");
  const email = optional(input.email, "email", 320);
  const normalizedEmail = email ? normalizeEmail(email.normalize("NFC")) : null;
  if (normalizedEmail && !emailPattern.test(normalizedEmail)) {
    throw new AuthError("validation_error", "SCIM email is invalid", 400);
  }
  return {
    externalId: optional(input.externalId, "externalId", 512),
    userName,
    email: normalizedEmail,
    displayName: optional(input.displayName, "displayName", 200),
    givenName: optional(input.givenName, "givenName", 100),
    familyName: optional(input.familyName, "familyName", 100),
    active: input.active ?? true
  };
}

export function bounded(value: string, label: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new AuthError("validation_error", `${label} is invalid`, 400);
  }
  return normalized;
}

function optional(value: string | null | undefined, label: string, maximum: number): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim().normalize("NFC");
  if (!normalized) return null;
  if (normalized.length > maximum) {
    throw new AuthError("validation_error", `${label} is invalid`, 400);
  }
  return normalized;
}
