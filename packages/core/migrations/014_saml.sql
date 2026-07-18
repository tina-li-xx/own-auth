create table if not exists own_auth_saml_connections (
  id text primary key,
  organisation_id text not null references own_auth_organisations(id) on delete cascade,
  connection_key text not null unique,
  name text not null,
  idp_entity_id text not null,
  sso_url text not null,
  idp_certificates text[] not null,
  attribute_mapping jsonb not null,
  account_linking text not null default 'explicit',
  jit_provisioning_enabled boolean not null default false,
  jit_default_role text not null default 'member',
  request_signing_certificate text,
  request_signing_key_ciphertext text,
  request_signing_key_nonce text,
  request_signing_encryption_key_id text,
  disabled_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint own_auth_saml_connections_entity_unique
    unique (organisation_id, idp_entity_id),
  constraint own_auth_saml_connections_linking_check
    check (account_linking in ('explicit', 'verified_email')),
  constraint own_auth_saml_connections_certificates_check
    check (cardinality(idp_certificates) > 0),
  constraint own_auth_saml_connections_mapping_check
    check (jsonb_typeof(attribute_mapping) = 'object'),
  constraint own_auth_saml_connections_signing_check
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
  intent text not null,
  user_id text references own_auth_users(id) on delete cascade,
  destination text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null,
  constraint own_auth_saml_transactions_intent_check
    check (intent in ('sign_in', 'link')),
  constraint own_auth_saml_transactions_link_user_check
    check (intent <> 'link' or user_id is not null)
);

create index if not exists own_auth_saml_transactions_usable_idx
  on own_auth_saml_transactions (relay_state_hash, consumed_at, expires_at);

create table if not exists own_auth_saml_assertion_replays (
  assertion_hash text primary key,
  connection_id text not null references own_auth_saml_connections(id) on delete cascade,
  consumed_at timestamptz not null,
  expires_at timestamptz not null
);

create index if not exists own_auth_saml_assertion_replays_expiry_idx
  on own_auth_saml_assertion_replays (expires_at);

insert into own_auth_migrations (version)
values ('014_saml')
on conflict (version) do nothing;
