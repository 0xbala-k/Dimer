-- supabase/migrations/003_whoop_cycles.sql
--
-- One row per Whoop cycle, synced from Whoop for the History tab. A cycle is
-- the unit (not the day), so two cycles that share a label both survive.
--
-- Rows cascade-delete with their users row. merge_anonymous_account (002)
-- therefore needs no change: the anonymous account's cycles disappear with it,
-- and the target account re-syncs its own from the same Whoop user.

create table whoop_cycles (
  user_id     uuid not null references users(id) on delete cascade,
  cycle_id    bigint not null,          -- Whoop's cycle id
  start       timestamptz not null,
  "end"       timestamptz,              -- null while the cycle is open
  tz_offset   text,                     -- Whoop's timezone_offset, e.g. "-08:00"
  day         date not null,            -- local date of start + 12h, in tz_offset
  score_state text not null,            -- SCORED | PENDING_SCORE | UNSCORABLE
  burned      integer,                  -- round(kilojoule / 4.184); null if unscored
  strain      numeric,
  updated_at  timestamptz default now(),
  primary key (user_id, cycle_id)
);

create index on whoop_cycles(user_id, start);

-- RLS
alter table whoop_cycles enable row level security;

create policy whoop_cycles_owner on whoop_cycles
  for all using (auth.uid() = user_id);
