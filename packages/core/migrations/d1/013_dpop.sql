alter table own_auth_authorization_clients
  add column dpop_bound_access_tokens integer not null default 0
    check (dpop_bound_access_tokens in (0, 1));

alter table own_auth_protected_resources
  add column require_dpop integer not null default 0
    check (require_dpop in (0, 1));

alter table own_auth_authorization_codes
  add column dpop_jkt text
    check (
      dpop_jkt is null or
      (length(dpop_jkt) = 43 and dpop_jkt not glob '*[^A-Za-z0-9_-]*')
    );

alter table own_auth_authorization_access_tokens
  add column dpop_jkt text
    check (
      dpop_jkt is null or
      (length(dpop_jkt) = 43 and dpop_jkt not glob '*[^A-Za-z0-9_-]*')
    );

alter table own_auth_authorization_refresh_tokens
  add column dpop_jkt text
    check (
      dpop_jkt is null or
      (length(dpop_jkt) = 43 and dpop_jkt not glob '*[^A-Za-z0-9_-]*')
    );

create table if not exists own_auth_dpop_proofs (
  proof_hash text primary key,
  consumed_at integer not null,
  expires_at integer not null
);

create index if not exists own_auth_dpop_proofs_expiry_idx
  on own_auth_dpop_proofs (expires_at);

insert into own_auth_migrations (version)
values ('013_dpop')
on conflict (version) do nothing;
