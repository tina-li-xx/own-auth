export {
  PostgresAuthStorage,
  createPostgresAuthStorage
} from "./postgres-storage.js";
export {
  PostgresRateLimitStore,
  createPostgresRateLimitStore
} from "./postgres-rate-limit-store.js";
export type {
  PostgresQueryable,
  PostgresQueryResult
} from "./postgres-types.js";

export const initialMigration = "001_initial.sql";

export const tables = {
  migrations: "own_auth_migrations",
  users: "own_auth_users",
  accounts: "own_auth_accounts",
  sessions: "own_auth_sessions",
  tokens: "own_auth_tokens",
  smsOtps: "own_auth_sms_otps",
  apiKeys: "own_auth_api_keys",
  organisations: "own_auth_organisations",
  organisationMembers: "own_auth_organisation_members",
  invitations: "own_auth_invitations",
  auditEvents: "own_auth_audit_events",
  rateLimits: "own_auth_rate_limits"
} as const;
