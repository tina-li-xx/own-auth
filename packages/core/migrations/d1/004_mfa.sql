-- TOTP factors, recovery codes, pending MFA challenges, and session assurance.

pragma defer_foreign_keys = on;

create table own_auth_sessions_next (
  id text primary key,
  user_id text not null references own_auth_users(id) on delete cascade,
  token_hash text not null unique,
  created_at integer not null,
  last_active_at integer not null,
  expires_at integer not null,
  idle_expires_at integer not null,
  ip_address text,
  user_agent text,
  revoked_at integer,
  revoke_reason text,
  authentication_methods text not null default '["legacy"]',
  assurance_level text not null default 'aal1',
  authenticated_at integer not null,
  constraint own_auth_sessions_assurance_level_check
    check (assurance_level in ('aal1', 'aal2'))
);

insert into own_auth_sessions_next
  (id, user_id, token_hash, created_at, last_active_at, expires_at, idle_expires_at,
   ip_address, user_agent, revoked_at, revoke_reason, authentication_methods,
   assurance_level, authenticated_at)
select
  id, user_id, token_hash, created_at, last_active_at, expires_at, idle_expires_at,
  ip_address, user_agent, revoked_at, revoke_reason, '["legacy"]', 'aal1', created_at
from own_auth_sessions;

drop table own_auth_sessions;
alter table own_auth_sessions_next rename to own_auth_sessions;

create index own_auth_sessions_user_active_idx
  on own_auth_sessions (user_id, revoked_at, expires_at, idle_expires_at);

pragma defer_foreign_keys = off;

create table if not exists own_auth_mfa_factors (
  id text primary key,
  user_id text not null references own_auth_users(id) on delete cascade,
  factor_type text not null default 'totp',
  status text not null,
  ciphertext text not null,
  nonce text not null,
  encryption_key_id text not null,
  last_used_timestep integer,
  created_at integer not null,
  updated_at integer not null,
  disabled_at integer,
  constraint own_auth_mfa_factors_type_check check (factor_type = 'totp'),
  constraint own_auth_mfa_factors_status_check
    check (status in ('pending', 'active', 'disabled'))
);

create unique index if not exists own_auth_mfa_factors_one_active_totp_idx
  on own_auth_mfa_factors (user_id, factor_type) where status = 'active';

create table if not exists own_auth_recovery_codes (
  id text primary key,
  user_id text not null references own_auth_users(id) on delete cascade,
  code_hash text not null unique,
  consumed_at integer,
  created_at integer not null
);

create index if not exists own_auth_recovery_codes_user_idx
  on own_auth_recovery_codes (user_id, consumed_at);

create table if not exists own_auth_mfa_challenges (
  id text primary key,
  user_id text not null references own_auth_users(id) on delete cascade,
  token_hash text not null unique,
  primary_method text not null,
  methods text not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  expires_at integer not null,
  consumed_at integer,
  created_at integer not null,
  constraint own_auth_mfa_challenges_attempts_check
    check (attempts >= 0 and max_attempts > 0)
);

create index if not exists own_auth_mfa_challenges_usable_idx
  on own_auth_mfa_challenges (token_hash, consumed_at, expires_at);

insert into own_auth_migrations (version)
values ('004_mfa')
on conflict (version) do nothing;
