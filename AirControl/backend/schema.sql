create table if not exists users (
  id serial primary key,
  username text unique not null,
  salt text not null,
  password_hash text not null,
  role text not null default 'user',
  created_at timestamptz not null default now()
);

create table if not exists device_config (
  device_code text primary key,
  air_cycle_minutes integer not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by jsonb
);

create table if not exists device_state (
  device_code text primary key,
  light1 boolean not null default false,
  light2 boolean not null default false,
  light3 boolean not null default false,
  air_on_minutes integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by jsonb
);

create table if not exists command_log (
  id bigserial primary key,
  device_code text not null,
  command_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  created_by jsonb
);

create index if not exists idx_command_log_device_code on command_log(device_code, created_at desc);
