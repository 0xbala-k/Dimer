-- supabase/migrations/001_initial_schema.sql

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  whoop_user_id text unique not null,
  whoop_access_token text,
  whoop_refresh_token text,
  whoop_token_expires_at timestamptz,
  created_at timestamptz default now()
);

create table daily_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  date date not null,
  calories_burned numeric default 0,
  calories_consumed numeric default 0,
  whoop_strain numeric,
  whoop_recovery numeric,
  updated_at timestamptz default now(),
  unique(user_id, date)
);

create table food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  logged_at timestamptz default now(),
  date date not null,
  source text check (source in ('photo','text','restaurant','barcode')),
  name text not null,
  calories numeric not null,
  protein numeric default 0,
  carbs numeric default 0,
  fats numeric default 0,
  fiber numeric default 0,
  raw_response jsonb,
  notes text
);

-- RLS
alter table users enable row level security;
alter table daily_summaries enable row level security;
alter table food_logs enable row level security;

-- Users can only see/edit their own row
create policy "users_self" on users
  for all using (auth.uid() = id);

-- daily_summaries scoped to owner
create policy "daily_summaries_owner" on daily_summaries
  for all using (auth.uid() = user_id);

-- food_logs scoped to owner
create policy "food_logs_owner" on food_logs
  for all using (auth.uid() = user_id);

create index on food_logs(user_id, date);

-- Allow realtime on food_logs
alter publication supabase_realtime add table food_logs;
