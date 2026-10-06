-- Rezervační systém Aninka — schéma databáze
-- Spustit jednorázově v Supabase → SQL Editor

create extension if not exists pgcrypto;

create table if not exists clients (
  id          uuid primary key default gen_random_uuid(),
  first_name  text not null,
  last_name   text not null,
  phone       text not null unique,
  email       text not null,
  note        text not null default '',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists packages (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  kind          text not null check (kind in ('credits', 'weekly')),
  credits_total int  not null default 0,
  credits_used  int  not null default 0,
  weekly_limit  int  not null default 0,
  valid_from    date,
  valid_to      date,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists availability (
  id         uuid primary key default gen_random_uuid(),
  day        date not null,
  start_time time not null,
  end_time   time not null,
  created_at timestamptz not null default now()
);

create table if not exists bookings (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete cascade,
  package_id     uuid references packages(id) on delete set null,
  day            date not null,
  start_time     time not null,
  duration_min   int  not null default 60,
  status         text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_by     text not null default 'client' check (created_by in ('client', 'admin')),
  gcal_event_id  text,
  created_at     timestamptz not null default now(),
  cancelled_at   timestamptz
);

create table if not exists sessions (
  token      text primary key,
  client_id  uuid references clients(id) on delete cascade,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key   text primary key,
  value jsonb not null
);

create index if not exists bookings_day_idx       on bookings (day) where status = 'confirmed';
create index if not exists bookings_client_idx    on bookings (client_id, day);
create index if not exists availability_day_idx   on availability (day);
create index if not exists packages_client_idx    on packages (client_id) where is_active;

-- Data jsou dostupná výhradně přes service key na serveru.
-- RLS zapnuté bez politik = anonymní klíč nepřečte nic.
alter table clients      enable row level security;
alter table packages     enable row level security;
alter table availability enable row level security;
alter table bookings     enable row level security;
alter table sessions     enable row level security;
alter table settings     enable row level security;
