-- Organisation roles are defined by each Own Auth instance. The database
-- validates the shared identifier format without owning the role catalogue.

alter table own_auth_organisation_members
  drop constraint if exists own_auth_organisation_members_role_check;

alter table own_auth_organisation_members
  add constraint own_auth_organisation_members_role_check
  check (role ~ '^[a-z][a-z0-9_-]{0,63}$');

alter table own_auth_invitations
  drop constraint if exists own_auth_invitations_role_check;

alter table own_auth_invitations
  add constraint own_auth_invitations_role_check
  check (role ~ '^[a-z][a-z0-9_-]{0,63}$');

insert into own_auth_migrations (version)
values ('009_custom_authorization')
on conflict (version) do nothing;
