alter table own_auth_authorization_clients
  add column if not exists dpop_bound_access_tokens boolean not null default false;

alter table own_auth_protected_resources
  add column if not exists require_dpop boolean not null default false;

alter table own_auth_authorization_codes
  add column if not exists dpop_jkt text
    check (dpop_jkt is null or dpop_jkt ~ '^[A-Za-z0-9_-]{43}$');

alter table own_auth_authorization_access_tokens
  add column if not exists dpop_jkt text
    check (dpop_jkt is null or dpop_jkt ~ '^[A-Za-z0-9_-]{43}$');

alter table own_auth_authorization_refresh_tokens
  add column if not exists dpop_jkt text
    check (dpop_jkt is null or dpop_jkt ~ '^[A-Za-z0-9_-]{43}$');

create table if not exists own_auth_dpop_proofs (
  proof_hash text primary key,
  consumed_at timestamptz not null,
  expires_at timestamptz not null
);

create index if not exists own_auth_dpop_proofs_expiry_idx
  on own_auth_dpop_proofs (expires_at);

insert into own_auth_migrations (version)
values ('013_dpop')
on conflict (version) do nothing;
