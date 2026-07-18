create table if not exists own_auth_scim_connections (
  id text primary key,
  organisation_id text not null references own_auth_organisations(id) on delete cascade,
  connection_key text not null unique,
  name text not null,
  default_role text not null default 'member',
  account_linking text not null default 'explicit'
    check (account_linking in ('explicit', 'email')),
  saml_connection_id text unique references own_auth_saml_connections(id) on delete set null,
  disabled_at integer,
  created_at integer not null,
  updated_at integer not null
);

create index if not exists own_auth_scim_connections_organisation_idx
  on own_auth_scim_connections (organisation_id, created_at);

create table if not exists own_auth_scim_tokens (
  id text primary key,
  connection_id text not null references own_auth_scim_connections(id) on delete cascade,
  name text not null,
  prefix text not null unique,
  token_hash text not null unique,
  expires_at integer,
  last_used_at integer,
  revoked_at integer,
  created_at integer not null
);

create index if not exists own_auth_scim_tokens_connection_idx
  on own_auth_scim_tokens (connection_id, created_at);

create table if not exists own_auth_scim_users (
  id text primary key,
  connection_id text not null references own_auth_scim_connections(id) on delete cascade,
  user_id text not null references own_auth_users(id) on delete cascade,
  membership_id text not null references own_auth_organisation_members(id) on delete cascade,
  external_id text,
  user_name text not null,
  normalized_user_name text not null,
  email text,
  normalized_email text,
  display_name text,
  given_name text,
  family_name text,
  active integer not null default 1 check (active in (0, 1)),
  version integer not null default 1 check (version > 0),
  deleted_at integer,
  created_at integer not null,
  updated_at integer not null,
  unique (connection_id, user_id),
  unique (connection_id, normalized_user_name),
  unique (connection_id, external_id)
);

create index if not exists own_auth_scim_users_connection_list_idx
  on own_auth_scim_users (connection_id, deleted_at, created_at, id);

create index if not exists own_auth_scim_users_email_idx
  on own_auth_scim_users (connection_id, normalized_email);

create unique index if not exists own_auth_scim_users_active_email_unique
  on own_auth_scim_users (connection_id, normalized_email)
  where normalized_email is not null and deleted_at is null;

insert or ignore into own_auth_migrations (version) values ('015_scim');
