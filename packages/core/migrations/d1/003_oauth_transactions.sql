-- OAuth account providers become validated identifiers. Redirect and One Tap
-- transactions store only hashed, short-lived state.

pragma defer_foreign_keys = on;

create table own_auth_accounts_next (
  id text primary key,
  user_id text not null references own_auth_users(id) on delete cascade,
  provider text not null,
  provider_account_id text not null,
  provider_email text,
  provider_phone text,
  created_at integer not null,
  updated_at integer not null,
  constraint own_auth_accounts_provider_check check (
    length(provider) between 1 and 64
    and substr(provider, 1, 1) glob '[a-z]'
    and provider not glob '*[^a-z0-9._-]*'
  )
);

insert into own_auth_accounts_next
  (id, user_id, provider, provider_account_id, provider_email, provider_phone, created_at, updated_at)
select
  id, user_id, provider, provider_account_id, provider_email, provider_phone, created_at, updated_at
from own_auth_accounts;

drop table own_auth_accounts;
alter table own_auth_accounts_next rename to own_auth_accounts;

create unique index own_auth_accounts_provider_account_unique
  on own_auth_accounts (provider, provider_account_id);
create index own_auth_accounts_user_id_idx
  on own_auth_accounts (user_id);

pragma defer_foreign_keys = off;

create table if not exists own_auth_oauth_transactions (
  id text primary key,
  provider text not null,
  flow_kind text not null,
  intent text not null,
  state_hash text not null unique,
  destination text,
  interaction_mode text not null,
  opener_origin text,
  user_id text references own_auth_users(id) on delete cascade,
  expires_at integer not null,
  consumed_at integer,
  created_at integer not null,
  constraint own_auth_oauth_transactions_provider_check
    check (provider in ('google', 'github', 'apple')),
  constraint own_auth_oauth_transactions_flow_check
    check (flow_kind in ('redirect', 'one_tap')),
  constraint own_auth_oauth_transactions_intent_check
    check (intent in ('sign_in', 'link')),
  constraint own_auth_oauth_transactions_interaction_check
    check (interaction_mode in ('redirect', 'popup')),
  constraint own_auth_oauth_transactions_link_user_check
    check (intent <> 'link' or user_id is not null),
  constraint own_auth_oauth_transactions_popup_origin_check
    check (interaction_mode <> 'popup' or opener_origin is not null)
);

create index if not exists own_auth_oauth_transactions_usable_idx
  on own_auth_oauth_transactions (state_hash, flow_kind, consumed_at, expires_at);

insert into own_auth_migrations (version)
values ('003_oauth_transactions')
on conflict (version) do nothing;
