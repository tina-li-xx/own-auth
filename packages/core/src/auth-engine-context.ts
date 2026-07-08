import pg from "pg";
import {
  ConsoleEmailProvider,
  ConsoleSmsProvider,
  type EmailProvider,
  type SmsProvider
} from "./providers.js";
import { InMemoryAuthStorage } from "./memory-storage.js";
import { PostgresAuthStorage } from "./postgres/postgres-storage.js";
import { InMemoryRateLimitStore, type RateLimitStore } from "./rate-limit.js";
import type { AuthStorage } from "./storage.js";
import {
  day,
  defaultTokenTtls,
  minute,
  type OwnAuthOptions,
  type TokenTtlConfig
} from "./auth-engine-types.js";

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
}

export function createAuthEngineContext(options: OwnAuthOptions = {}): AuthEngineContext {
  const tokenPepper = options.tokenPepper ?? process.env.OWN_AUTH_TOKEN_PEPPER ?? "";
  if (process.env.NODE_ENV === "production" && tokenPepper.length === 0) {
    throw new Error("OWN_AUTH_TOKEN_PEPPER is required in production.");
  }

  const baseUrl = options.baseUrl ?? "http://localhost:3000";

  return {
    storage: options.storage ?? createDefaultStorage(),
    rateLimitStore: options.rateLimitStore ?? new InMemoryRateLimitStore(),
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
    passwordMinLength: options.password?.minLength ?? 8
  };
}

function createDefaultStorage(): AuthStorage {
  const nodeEnv = process.env.NODE_ENV;
  const databaseUrl = process.env.DATABASE_URL;

  if (nodeEnv === "test") {
    return new InMemoryAuthStorage();
  }

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. Set DATABASE_URL or pass storage to createOwnAuth().");
  }

  return new PostgresAuthStorage(new pg.Pool({ connectionString: databaseUrl }));
}
