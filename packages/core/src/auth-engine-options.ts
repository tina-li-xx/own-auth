import type { EmailProvider, SmsProvider } from "./providers.js";
import type { RateLimitStore } from "./rate-limit.js";
import type { AuthStorage } from "./storage.js";
import type { TokenType } from "./types.js";

export const minute = 60 * 1000;
export const hour = 60 * minute;
export const day = 24 * hour;

export type TokenTtlConfig = Partial<Record<TokenType, number>>;

export interface OwnAuthOptions {
  storage?: AuthStorage;
  rateLimitStore?: RateLimitStore;
  emailProvider?: EmailProvider;
  smsProvider?: SmsProvider;
  baseUrl?: string;
  tokenPepper?: string;
  exposeRawTokens?: boolean;
  allowMagicLinkSignup?: boolean;
  allowPhoneSignup?: boolean;
  redirectAllowlist?: string[];
  session?: {
    ttlMs?: number;
    idleTtlMs?: number;
  };
  tokenTtlMs?: TokenTtlConfig;
  sms?: {
    otpTtlMs?: number;
    maxAttempts?: number;
    codeLength?: number;
  };
  password?: {
    minLength?: number;
  };
}

export const defaultTokenTtls: Required<TokenTtlConfig> = {
  email_verification: day,
  password_reset: hour,
  magic_link: 15 * minute,
  organisation_invite: 7 * day,
  phone_verification: 10 * minute
};
