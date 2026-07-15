-- Optional encrypted provider refresh credentials. Access tokens are never stored.

create table if not exists own_auth_oauth_credentials (
  id text primary key,
  account_id text not null unique references own_auth_accounts(id) on delete cascade,
  provider text not null,
  ciphertext text not null,
  nonce text not null,
  encryption_key_id text not null,
  scopes text not null default '[]',
  created_at integer not null,
  updated_at integer not null,
  rotated_at integer,
  constraint own_auth_oauth_credentials_provider_check
    check (provider in ('google', 'github', 'apple'))
);

insert into own_auth_migrations (version)
values ('005_oauth_credentials')
on conflict (version) do nothing;
