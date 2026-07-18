create table if not exists own_auth_saml_connections (
  id text primary key,
  organisation_id text not null references own_auth_organisations(id) on delete cascade,
  connection_key text not null unique,
  name text not null,
  idp_entity_id text not null,
  sso_url text not null,
  idp_certificates text not null check (json_valid(idp_certificates)),
  attribute_mapping text not null check (json_valid(attribute_mapping)),
  account_linking text not null default 'explicit'
    check (account_linking in ('explicit', 'verified_email')),
  jit_provisioning_enabled integer not null default 0
    check (jit_provisioning_enabled in (0, 1)),
  jit_default_role text not null default 'member',
  request_signing_certificate text,
  request_signing_key_ciphertext text,
  request_signing_key_nonce text,
  request_signing_encryption_key_id text,
  disabled_at integer,
  created_at integer not null,
  updated_at integer not null,
  unique (organisation_id, idp_entity_id),
  check (
    (request_signing_certificate is null and request_signing_key_ciphertext is null and
     request_signing_key_nonce is null and request_signing_encryption_key_id is null) or
    (request_signing_certificate is not null and request_signing_key_ciphertext is not null and
     request_signing_key_nonce is not null and request_signing_encryption_key_id is not null)
  )
);

create index if not exists own_auth_saml_connections_organisation_idx
  on own_auth_saml_connections (organisation_id, created_at);

create table if not exists own_auth_saml_transactions (
  id text primary key,
  connection_id text not null references own_auth_saml_connections(id) on delete cascade,
  request_id_hash text not null unique,
  relay_state_hash text not null unique,
  intent text not null check (intent in ('sign_in', 'link')),
  user_id text references own_auth_users(id) on delete cascade,
  destination text,
  expires_at integer not null,
  consumed_at integer,
  created_at integer not null,
  check (intent <> 'link' or user_id is not null)
);

create index if not exists own_auth_saml_transactions_usable_idx
  on own_auth_saml_transactions (relay_state_hash, consumed_at, expires_at);

create table if not exists own_auth_saml_assertion_replays (
  assertion_hash text primary key,
  connection_id text not null references own_auth_saml_connections(id) on delete cascade,
  consumed_at integer not null,
  expires_at integer not null
);

create index if not exists own_auth_saml_assertion_replays_expiry_idx
  on own_auth_saml_assertion_replays (expires_at);

insert into own_auth_migrations (version)
values ('014_saml')
on conflict (version) do nothing;
