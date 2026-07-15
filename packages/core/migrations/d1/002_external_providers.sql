-- Apple and Google are already present in the initial D1 account constraint.

insert into own_auth_migrations (version)
values ('002_external_providers')
on conflict (version) do nothing;
