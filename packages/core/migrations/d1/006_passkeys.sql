-- Passkey credentials serve primary sign-in and MFA. Challenges are hashed and single-use.

create table if not exists own_auth_passkeys (
  id text primary key,
  user_id text not null references own_auth_users(id) on delete cascade,
  credential_id text not null unique,
  public_key blob not null,
  counter integer not null default 0,
  transports text not null default '[]',
  device_type text not null,
  backed_up integer not null,
  discoverable integer not null,
  name text not null,
  metadata text not null default '{}',
  created_at integer not null,
  updated_at integer not null,
  last_used_at integer,
  constraint own_auth_passkeys_counter_check check (counter >= 0),
  constraint own_auth_passkeys_device_type_check
    check (device_type in ('singleDevice', 'multiDevice')),
  constraint own_auth_passkeys_backed_up_check check (backed_up in (0, 1)),
  constraint own_auth_passkeys_discoverable_check check (discoverable in (0, 1))
);

create index if not exists own_auth_passkeys_user_idx
  on own_auth_passkeys (user_id, created_at desc);

create table if not exists own_auth_webauthn_challenges (
  id text primary key,
  challenge_hash text not null unique,
  user_id text references own_auth_users(id) on delete cascade,
  mfa_challenge_id text references own_auth_mfa_challenges(id) on delete cascade,
  purpose text not null,
  expires_at integer not null,
  consumed_at integer,
  created_at integer not null,
  constraint own_auth_webauthn_challenges_purpose_check
    check (purpose in ('registration', 'authentication', 'mfa')),
  constraint own_auth_webauthn_challenges_mfa_check
    check (purpose <> 'mfa' or mfa_challenge_id is not null)
);

create index if not exists own_auth_webauthn_challenges_usable_idx
  on own_auth_webauthn_challenges (challenge_hash, purpose, consumed_at, expires_at);

insert into own_auth_migrations (version)
values ('006_passkeys')
on conflict (version) do nothing;
