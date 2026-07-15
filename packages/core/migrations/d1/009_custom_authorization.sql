-- D1 cannot replace CHECK constraints in place. Rebuild the two role-bearing
-- tables while preserving their rows, foreign keys, and indexes.

pragma defer_foreign_keys = on;

create table own_auth_organisation_members_next (
  id text primary key,
  organisation_id text not null references own_auth_organisations(id) on delete cascade,
  user_id text not null references own_auth_users(id) on delete cascade,
  role text not null,
  status text not null,
  joined_at integer,
  removed_at integer,
  created_at integer not null,
  updated_at integer not null,
  constraint own_auth_organisation_members_role_check check (
    length(role) between 1 and 64
    and substr(role, 1, 1) glob '[a-z]'
    and role not glob '*[^a-z0-9_-]*'
  ),
  constraint own_auth_organisation_members_status_check
    check (status in ('active', 'suspended', 'removed'))
);

insert into own_auth_organisation_members_next
  (id, organisation_id, user_id, role, status, joined_at, removed_at, created_at, updated_at)
select
  id, organisation_id, user_id, role, status, joined_at, removed_at, created_at, updated_at
from own_auth_organisation_members;

drop table own_auth_organisation_members;
alter table own_auth_organisation_members_next rename to own_auth_organisation_members;

create unique index own_auth_organisation_members_unique
  on own_auth_organisation_members (organisation_id, user_id);
create index own_auth_organisation_members_user_idx
  on own_auth_organisation_members (user_id, status);

create table own_auth_invitations_next (
  id text primary key,
  token_id text references own_auth_tokens(id) on delete set null,
  organisation_id text not null references own_auth_organisations(id) on delete cascade,
  email text,
  phone text,
  role text not null,
  invited_by_user_id text not null references own_auth_users(id),
  status text not null,
  expires_at integer not null,
  accepted_at integer,
  revoked_at integer,
  created_at integer not null,
  constraint own_auth_invitations_role_check check (
    length(role) between 1 and 64
    and substr(role, 1, 1) glob '[a-z]'
    and role not glob '*[^a-z0-9_-]*'
  ),
  constraint own_auth_invitations_status_check
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  constraint own_auth_invitations_contact_check
    check (email is not null or phone is not null)
);

insert into own_auth_invitations_next
  (
    id, token_id, organisation_id, email, phone, role, invited_by_user_id,
    status, expires_at, accepted_at, revoked_at, created_at
  )
select
  id, token_id, organisation_id, email, phone, role, invited_by_user_id,
  status, expires_at, accepted_at, revoked_at, created_at
from own_auth_invitations;

drop table own_auth_invitations;
alter table own_auth_invitations_next rename to own_auth_invitations;

create unique index own_auth_invitations_token_idx
  on own_auth_invitations (token_id) where token_id is not null;
create index own_auth_invitations_pending_email_idx
  on own_auth_invitations (organisation_id, lower(email), status, created_at desc)
  where email is not null;

pragma defer_foreign_keys = off;

insert into own_auth_migrations (version)
values ('009_custom_authorization')
on conflict (version) do nothing;
