-- Track third-party plugin migrations independently from Own Auth core migrations.

create table if not exists own_auth_plugin_migrations (
  id text primary key,
  plugin_id text not null,
  plugin_version text not null,
  checksum text not null,
  applied_at integer not null default (cast(strftime('%s', 'now') as integer) * 1000)
);

create index if not exists own_auth_plugin_migrations_plugin_idx
  on own_auth_plugin_migrations (plugin_id, applied_at);

insert into own_auth_migrations (version)
values ('007_plugin_migrations')
on conflict (version) do nothing;
