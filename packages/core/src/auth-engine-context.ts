import pg from "pg";
import {
  ConsoleEmailProvider,
  ConsoleSmsProvider,
  type EmailProvider,
  type SmsProvider
} from "./providers.js";
import { InMemoryAuthStorage } from "./memory-storage.js";
import { PostgresRateLimitStore } from "./postgres/postgres-rate-limit-store.js";
import { PostgresAuthStorage } from "./postgres/postgres-storage.js";
import { InMemoryRateLimitStore, type RateLimitStore } from "./rate-limit.js";
import type { AuthStorage } from "./storage.js";
import { createEncryptionKeyRing, type EncryptionKeyRing } from "./encryption.js";
import { createOAuthProviderRegistry } from "./oauth-registry.js";
import type { OAuthAccountLinking, OAuthProviderAdapter } from "./oauth-types.js";
import type { ExternalAccountProvider } from "./types.js";
import {
  day,
  defaultTokenTtls,
  minute,
  type OwnAuthOptions,
  type TokenTtlConfig
} from "./auth-engine-types.js";
import type { PasskeyOptions } from "./auth-engine-options.js";
import { normalizeTrustedWebOrigin } from "./url-security.js";

export interface AuthEngineContext {
  storage: AuthStorage;
  rateLimitStore: RateLimitStore;
  emailProvider: EmailProvider;
  smsProvider: SmsProvider;
  baseUrl: string;
  tokenPepper: string;
  exposeRawTokens: boolean;
  allowMagicLinkSignup: boolean;
  allowPhoneSignup: boolean;
  redirectAllowlist: string[];
  sessionTtlMs: number;
  sessionIdleTtlMs: number;
  tokenTtls: Required<TokenTtlConfig>;
  smsOtpTtlMs: number;
  smsMaxAttempts: number;
  smsCodeLength: number;
  passwordMinLength: number;
  encryption: EncryptionKeyRing | null;
  oauthProviders: ReadonlyMap<ExternalAccountProvider, OAuthProviderAdapter>;
  oauthAccountLinking: OAuthAccountLinking;
  mfaIssuer: string;
  mfaChallengeTtlMs: number;
  mfaMaxAttempts: number;
  recoveryCodeCount: number;
  passkeys: Required<PasskeyOptions> | null;
}

export function createAuthEngineContext(options: OwnAuthOptions = {}): AuthEngineContext {
  const tokenPepper = options.tokenPepper ?? process.env.OWN_AUTH_TOKEN_PEPPER ?? "";
  if (process.env.NODE_ENV === "production" && tokenPepper.length === 0) {
    throw new Error("OWN_AUTH_TOKEN_PEPPER is required in production.");
  }

  const baseUrl = options.baseUrl ?? "http://localhost:3000";
  const persistence = createDefaultPersistence(options.storage);
  const encryption = createEncryptionKeyRing(options.encryption);
  const oauthProviders = createOAuthProviderRegistry(options.oauth);
  if (!encryption && [...oauthProviders.values()].some((provider) => provider.offlineAccess)) {
    throw new Error("OAuth offline access requires encryption configuration");
  }
  const mfa = normalizeMfaOptions(options.mfa);

  return {
    storage: persistence.storage,
    rateLimitStore: options.rateLimitStore ?? persistence.rateLimitStore,
    emailProvider: options.emailProvider ?? new ConsoleEmailProvider(),
    smsProvider: options.smsProvider ?? new ConsoleSmsProvider(),
    baseUrl,
    tokenPepper,
    exposeRawTokens: options.exposeRawTokens ?? false,
    allowMagicLinkSignup: options.allowMagicLinkSignup ?? true,
    allowPhoneSignup: options.allowPhoneSignup ?? true,
    redirectAllowlist: options.redirectAllowlist ?? [baseUrl],
    sessionTtlMs: options.session?.ttlMs ?? 30 * day,
    sessionIdleTtlMs: options.session?.idleTtlMs ?? 7 * day,
    tokenTtls: { ...defaultTokenTtls, ...options.tokenTtlMs },
    smsOtpTtlMs: options.sms?.otpTtlMs ?? 10 * minute,
    smsMaxAttempts: options.sms?.maxAttempts ?? 5,
    smsCodeLength: options.sms?.codeLength ?? 6,
    passwordMinLength: options.password?.minLength ?? 8,
    encryption,
    oauthProviders,
    oauthAccountLinking: options.oauth?.accountLinking ?? "explicit",
    mfaIssuer: mfa.issuer,
    mfaChallengeTtlMs: mfa.challengeTtlMs,
    mfaMaxAttempts: mfa.maxAttempts,
    recoveryCodeCount: mfa.recoveryCodeCount,
    passkeys: normalizePasskeyOptions(options.passkeys)
  };
}

function normalizeMfaOptions(options: OwnAuthOptions["mfa"]): {
  issuer: string;
  challengeTtlMs: number;
  maxAttempts: number;
  recoveryCodeCount: number;
} {
  const issuer = options?.issuer?.trim() ?? "Own Auth";
  if (!issuer) {
    throw new Error("mfa.issuer must be non-empty");
  }
  return {
    issuer,
    challengeTtlMs: positiveInteger(
      options?.challengeTtlMs ?? 5 * minute,
      "mfa.challengeTtlMs"
    ),
    maxAttempts: positiveInteger(options?.maxAttempts ?? 5, "mfa.maxAttempts"),
    recoveryCodeCount: positiveInteger(
      options?.recoveryCodeCount ?? 10,
      "mfa.recoveryCodeCount"
    )
  };
}

function positiveInteger(value: number, option: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${option} must be a positive integer`);
  }
  return value;
}

function normalizePasskeyOptions(options?: PasskeyOptions): Required<PasskeyOptions> | null {
  if (!options) {
    return null;
  }
  if (!/^(?=.{1,253}$)(?!-)[a-z0-9.-]+(?<!-)$/.test(options.rpId)) {
    throw new Error("passkeys.rpId must be a valid lowercase domain name");
  }
  if (!options.rpName.trim()) {
    throw new Error("passkeys.rpName is required");
  }
  const origins = options.origins.map((origin) => normalizeTrustedWebOrigin(origin));
  if (origins.length === 0 || origins.some((origin) => !origin)) {
    throw new Error("passkeys.origins must contain HTTPS or local development origins");
  }
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("passkeys.timeoutMs must be a positive integer");
  }
  return {
    rpId: options.rpId,
    rpName: options.rpName.trim(),
    origins: origins as string[],
    timeoutMs
  };
}

function createDefaultPersistence(storage?: AuthStorage): {
  storage: AuthStorage;
  rateLimitStore: RateLimitStore;
} {
  if (storage) {
    return {
      storage,
      rateLimitStore: new InMemoryRateLimitStore()
    };
  }

  const nodeEnv = process.env.NODE_ENV;
  const databaseUrl = process.env.DATABASE_URL;

  if (nodeEnv === "test") {
    return {
      storage: new InMemoryAuthStorage(),
      rateLimitStore: new InMemoryRateLimitStore()
    };
  }

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. Set DATABASE_URL or pass storage to createOwnAuth().");
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  return {
    storage: new PostgresAuthStorage(pool),
    rateLimitStore: new PostgresRateLimitStore(pool)
  };
}
