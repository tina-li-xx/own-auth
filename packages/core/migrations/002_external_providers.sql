-- 002_external_providers.sql
-- Allow verified Apple and Google identities to be linked as auth accounts.

alter table own_auth_accounts
  drop constraint if exists own_auth_accounts_provider_check;

alter table own_auth_accounts
  add constraint own_auth_accounts_provider_check
  check (provider in ('password', 'magic_link', 'phone', 'apple', 'google'));

insert into own_auth_migrations (version)
values ('002_external_providers')
on conflict (version) do nothing;
