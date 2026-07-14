import { AuthError } from "./errors.js";
import { requireEncryptionKeyRing } from "./encryption.js";
import { requireOAuthProvider } from "./oauth-registry.js";
import type { Account, ExternalAccountProvider } from "./types.js";
import type {
  GetExternalAccessTokenInput,
  ExternalAccessTokenResult,
  RevokeExternalProviderAccessInput
} from "./auth-engine-types.js";
import { audit, requireActiveUser, type AuthEngineContext } from "./auth-engine-internals.js";

export async function getExternalAccessToken(
  ctx: AuthEngineContext,
  input: GetExternalAccessTokenInput
): Promise<ExternalAccessTokenResult> {
  const account = await requireOwnedProviderAccount(ctx, input);
  const credential = await ctx.storage.getOAuthCredentialByAccountId(account.id);
  if (!credential) {
    throw missingCredential();
  }
  const encryption = requireEncryptionKeyRing(ctx.encryption, "OAuth offline access");
  const provider = requireOAuthProvider(ctx.oauthProviders, input.provider);
  if (!provider.refresh) {
    throw new AuthError("validation_error", "This OAuth provider cannot refresh access", 400);
  }
  const decrypted = await encryption.decrypt(
    {
      ciphertext: credential.ciphertext,
      nonce: credential.nonce,
      encryptionKeyId: credential.encryptionKeyId
    },
    "oauth-refresh",
    { accountId: account.id, provider: input.provider }
  );
  const refreshed = await provider.refresh(decrypted.plaintext);
  const replacement = refreshed.refreshToken ?? decrypted.plaintext;
  if (refreshed.refreshToken || decrypted.needsRotation) {
    const encrypted = await encryption.encrypt(replacement, "oauth-refresh", {
      accountId: account.id,
      provider: input.provider
    });
    const rotated = await ctx.storage.rotateOAuthCredential(
      credential.id,
      credential.ciphertext,
      {
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        encryptionKeyId: encrypted.encryptionKeyId,
        scopes: refreshed.scopes.length > 0 ? refreshed.scopes : credential.scopes,
        updatedAt: new Date(),
        rotatedAt: refreshed.refreshToken ? new Date() : credential.rotatedAt
      }
    );
    if (!rotated) {
      throw new AuthError(
        "oauth_provider_error",
        "Provider credentials changed during refresh. Try again.",
        409
      );
    }
  }
  await audit(ctx, {
    eventType: "oauth.credential_refreshed",
    actorUserId: input.actorUserId,
    targetUserId: input.actorUserId,
    context: input.request,
    metadata: { provider: input.provider }
  });
  return {
    accessToken: refreshed.accessToken,
    scopes: refreshed.scopes.length > 0 ? refreshed.scopes : credential.scopes
  };
}

export async function revokeExternalProviderAccess(
  ctx: AuthEngineContext,
  input: RevokeExternalProviderAccessInput
): Promise<void> {
  const account = await requireOwnedProviderAccount(ctx, input);
  const credential = await ctx.storage.getOAuthCredentialByAccountId(account.id);
  if (!credential) {
    throw missingCredential();
  }
  const encryption = requireEncryptionKeyRing(ctx.encryption, "OAuth offline access");
  const provider = requireOAuthProvider(ctx.oauthProviders, input.provider);
  if (provider.revoke) {
    const decrypted = await encryption.decrypt(
      {
        ciphertext: credential.ciphertext,
        nonce: credential.nonce,
        encryptionKeyId: credential.encryptionKeyId
      },
      "oauth-refresh",
      { accountId: account.id, provider: input.provider }
    );
    await provider.revoke(decrypted.plaintext);
  }
  await ctx.storage.deleteOAuthCredentialByAccountId(account.id);
  await audit(ctx, {
    eventType: "oauth.credential_revoked",
    actorUserId: input.actorUserId,
    targetUserId: input.actorUserId,
    context: input.request,
    metadata: { provider: input.provider }
  });
}

async function requireOwnedProviderAccount(
  ctx: AuthEngineContext,
  input: {
    actorUserId: string;
    provider: ExternalAccountProvider;
    providerAccountId?: string;
  }
): Promise<Account> {
  await requireActiveUser(ctx, input.actorUserId);
  const accounts = await ctx.storage.listAccountsByUserId(input.actorUserId);
  const matches = accounts.filter(
    (account) =>
      account.provider === input.provider &&
      (!input.providerAccountId || account.providerAccountId === input.providerAccountId)
  );
  if (matches.length !== 1) {
    throw missingCredential();
  }
  return matches[0] as Account;
}

function missingCredential(): AuthError {
  return new AuthError(
    "external_credential_missing",
    "Authenticate with this provider again to grant offline access",
    404
  );
}
