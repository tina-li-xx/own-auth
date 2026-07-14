-- OAuth identities continue to use own_auth_accounts. Transactions hold only
-- short-lived, hashed state for redirect OAuth and Google One Tap.

alter table own_auth_accounts
  drop constraint if exists own_auth_accounts_provider_check;

alter table own_auth_accounts
  add constraint own_auth_accounts_provider_check
  check (provider ~ '^[a-z][a-z0-9._-]{0,63}$');

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
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null,
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
