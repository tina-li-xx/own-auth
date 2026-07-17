create table if not exists own_auth_protected_resources (
  id text primary key,
  identifier text not null unique,
  name text not null,
  allowed_scopes text[] not null,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  revoked_at timestamptz,
  constraint own_auth_protected_resources_status_check
    check (status in ('active', 'revoked'))
);

create table if not exists own_auth_protected_resource_secrets (
  id text primary key,
  protected_resource_id text not null
    references own_auth_protected_resources(id) on delete cascade,
  prefix text not null,
  secret_hash text not null,
  created_at timestamptz not null,
  expires_at timestamptz,
  revoked_at timestamptz
);

create unique index if not exists own_auth_protected_resource_secrets_prefix_unique
  on own_auth_protected_resource_secrets (protected_resource_id, prefix);

alter table own_auth_authorization_grants
  add column if not exists protected_resource_id text
    references own_auth_protected_resources(id) on delete restrict;

alter table own_auth_authorization_codes
  add column if not exists protected_resource_id text
    references own_auth_protected_resources(id) on delete restrict;

alter table own_auth_authorization_access_tokens
  add column if not exists protected_resource_id text
    references own_auth_protected_resources(id) on delete restrict;

alter table own_auth_authorization_refresh_tokens
  add column if not exists protected_resource_id text
    references own_auth_protected_resources(id) on delete restrict;

drop index if exists own_auth_authorization_grants_client_user_unique;

create unique index if not exists own_auth_authorization_grants_unbound_unique
  on own_auth_authorization_grants (authorization_client_id, user_id)
  where protected_resource_id is null;

create unique index if not exists own_auth_authorization_grants_resource_unique
  on own_auth_authorization_grants (
    authorization_client_id,
    user_id,
    protected_resource_id
  ) where protected_resource_id is not null;

create index if not exists own_auth_authorization_access_tokens_resource_idx
  on own_auth_authorization_access_tokens (
    protected_resource_id,
    revoked_at,
    expires_at
  );

insert into own_auth_migrations (version)
values ('012_protected_resources')
on conflict (version) do nothing;
