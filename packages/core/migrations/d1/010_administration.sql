-- Administration remains application-authorized. These indexes support safe,
-- cursor-based support queries without adding database-owned administrator roles.

create index if not exists own_auth_users_admin_cursor_idx
  on own_auth_users (created_at desc, id desc);

create index if not exists own_auth_users_admin_status_cursor_idx
  on own_auth_users (disabled_at, created_at desc, id desc);

create index if not exists own_auth_audit_events_actor_cursor_idx
  on own_auth_audit_events (actor_user_id, created_at desc, id desc);

create index if not exists own_auth_audit_events_target_cursor_idx
  on own_auth_audit_events (target_user_id, created_at desc, id desc);

insert into own_auth_migrations (version)
values ('010_administration')
on conflict (version) do nothing;
