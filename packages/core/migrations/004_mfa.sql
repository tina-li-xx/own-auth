-- TOTP factors, recovery codes, pending MFA challenges, and session assurance.

alter table own_auth_sessions
  add column if not exists authentication_methods text[] not null default array['legacy']::text[],
  add column if not exists assurance_level text not null default 'aal1',
  add column if not exists authenticated_at timestamptz;

update own_auth_sessions
set authenticated_at = created_at
where authenticated_at is null;

alter table own_auth_sessions
  alter column authenticated_at set not null,
  drop constraint if exists own_auth_sessions_assurance_level_check;

alter table own_auth_sessions
  add constraint own_auth_sessions_assurance_level_check
  check (assurance_level in ('aal1', 'aal2'));

create table if not exists own_auth_mfa_factors (
  id text primary key,
  user_id text not null references own_auth_users(id) on delete cascade,
  factor_type text not null default 'totp',
  status text not null,
  ciphertext text not null,
  nonce text not null,
  encryption_key_id text not null,
  last_used_timestep bigint,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  disabled_at timestamptz,
  constraint own_auth_mfa_factors_type_check check (factor_type = 'totp'),
  constraint own_auth_mfa_factors_status_check check (status in ('pending', 'active', 'disabled'))
);

create unique index if not exists own_auth_mfa_factors_one_active_totp_idx
  on own_auth_mfa_factors (user_id, factor_type)
  where status = 'active';

create table if not exists own_auth_recovery_codes (
  id text primary key,
  user_id text not null references own_auth_users(id) on delete cascade,
  code_hash text not null unique,
  consumed_at timestamptz,
  created_at timestamptz not null
);

create index if not exists own_auth_recovery_codes_user_idx
  on own_auth_recovery_codes (user_id, consumed_at);

create table if not exists own_auth_mfa_challenges (
  id text primary key,
  user_id text not null references own_auth_users(id) on delete cascade,
  token_hash text not null unique,
  primary_method text not null,
  methods text[] not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null,
  constraint own_auth_mfa_challenges_attempts_check
    check (attempts >= 0 and max_attempts > 0)
);

create index if not exists own_auth_mfa_challenges_usable_idx
  on own_auth_mfa_challenges (token_hash, consumed_at, expires_at);

insert into own_auth_migrations (version)
values ('004_mfa')
on conflict (version) do nothing;
