create table if not exists households (
  id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  household_id text not null references households(id) on delete cascade,
  role text not null check (role in ('senior', 'caregiver')),
  name text not null,
  email text,
  address jsonb,
  self_pay_limit_cents integer not null default 2500,
  daily_cap_cents integer not null default 6000,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  last_options jsonb not null default '[]'::jsonb,
  turns integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id bigserial primary key,
  session_id text not null references sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  text text not null,
  at timestamptz not null default now()
);

create index if not exists messages_session_idx on messages (session_id, id);

create table if not exists orders (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  session_id text references sessions(id) on delete set null,
  product jsonb not null,
  quantity integer not null check (quantity between 1 and 10),
  total_cents integer not null check (total_cents > 0),
  merchant text not null,
  status text not null,
  route text,
  flags jsonb not null default '[]'::jsonb,
  ai_risk jsonb,
  summary text,
  decline_reason text,
  payer_role text check (payer_role in ('senior', 'caregiver')),
  paypal_order_id text unique,
  capture_id text,
  tracking jsonb,
  reminded_at timestamptz,
  caregiver_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Databases created before the caregiver token existed.
alter table orders add column if not exists caregiver_token text;

create index if not exists orders_user_idx on orders (user_id, created_at desc);

create table if not exists order_events (
  id bigserial primary key,
  order_id text not null references orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor text not null,
  at timestamptz not null default now()
);

create table if not exists daily_usage (
  day date primary key,
  agent_calls integer not null default 0
);

-- Groq voice calls (speaking pieces and transcriptions) per day, capped by DAILY_SPEECH_CAP.
alter table daily_usage add column if not exists speech_calls integer not null default 0;

-- Gifts to family are orders with kind = 'gift'; payee snapshots who gets the money.
alter table orders add column if not exists kind text not null default 'purchase' check (kind in ('purchase', 'gift'));
alter table orders add column if not exists payee jsonb;

create table if not exists trusted_people (
  id text primary key,
  household_id text not null references households(id) on delete cascade,
  name text not null,
  relationship text,
  paypal_email text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists trusted_people_name_idx on trusted_people (household_id, lower(name));

create table if not exists trusted_requests (
  id text primary key,
  household_id text not null references households(id) on delete cascade,
  name text not null,
  token text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
