import { createIdentityConflictError } from "../errors.js";

export function rethrowD1IdentityError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (
    isUniqueFailure(message, "own_auth_users.email") ||
    isUniqueFailure(message, "own_auth_users_email_unique")
  ) {
    throw createIdentityConflictError("email");
  }
  if (
    isUniqueFailure(message, "own_auth_users.phone") ||
    isUniqueFailure(message, "own_auth_users_phone_unique")
  ) {
    throw createIdentityConflictError("phone");
  }
  if (
    isUniqueFailure(message, "own_auth_accounts.provider, own_auth_accounts.provider_account_id") ||
    message.includes("own_auth_accounts_provider_account_unique")
  ) {
    throw createIdentityConflictError("providerAccount");
  }
  throw error;
}

function isUniqueFailure(message: string, target: string): boolean {
  return message.includes("UNIQUE constraint failed") && message.includes(target);
}
