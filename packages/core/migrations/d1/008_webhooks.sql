-- Persist signed webhook events, deliveries, and bounded attempt history.

create table if not exists own_auth_webhook_events (
  id text primary key,
  event_type text not null,
  version integer not null,
  payload text not null,
  created_at integer not null,
  constraint own_auth_webhook_events_version_check check (version = 1)
);

create table if not exists own_auth_webhook_deliveries (
  id text primary key,
  event_id text not null references own_auth_webhook_events(id) on delete cascade,
  endpoint_id text not null,
  endpoint_url text not null,
  status text not null default 'pending',
  attempts_in_cycle integer not null default 0,
  total_attempts integer not null default 0,
  next_attempt_at integer not null,
  lease_token text,
  lease_expires_at integer,
  delivered_at integer,
  failed_at integer,
  last_status_code integer,
  last_error_code text,
  created_at integer not null,
  updated_at integer not null,
  constraint own_auth_webhook_deliveries_event_endpoint_unique unique (event_id, endpoint_id),
  constraint own_auth_webhook_deliveries_status_check
    check (status in ('pending', 'processing', 'delivered', 'failed')),
  constraint own_auth_webhook_deliveries_attempts_check
    check (attempts_in_cycle >= 0 and total_attempts >= attempts_in_cycle)
);

create index if not exists own_auth_webhook_deliveries_due_idx
  on own_auth_webhook_deliveries (status, next_attempt_at, created_at);
create index if not exists own_auth_webhook_deliveries_lease_idx
  on own_auth_webhook_deliveries (status, lease_expires_at);
create index if not exists own_auth_webhook_deliveries_endpoint_idx
  on own_auth_webhook_deliveries (endpoint_id, created_at desc);

create table if not exists own_auth_webhook_attempts (
  id text primary key,
  delivery_id text not null references own_auth_webhook_deliveries(id) on delete cascade,
  attempt_number integer not null,
  started_at integer not null,
  finished_at integer not null,
  outcome text not null,
  status_code integer,
  error_code text,
  next_retry_at integer,
  constraint own_auth_webhook_attempts_number_check check (attempt_number > 0),
  constraint own_auth_webhook_attempts_delivery_number_unique unique (delivery_id, attempt_number),
  constraint own_auth_webhook_attempts_outcome_check
    check (outcome in ('delivered', 'retry_scheduled', 'failed'))
);

insert into own_auth_migrations (version)
values ('008_webhooks')
on conflict (version) do nothing;
