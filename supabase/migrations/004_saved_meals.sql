-- supabase/migrations/004_saved_meals.sql
--
-- Meals the user saved from the confirm card so they can be logged again in
-- one tap. A saved meal is a template: logging it copies its values into a new
-- food_logs row, so editing or deleting a saved meal never touches past logs.

create table saved_meals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  source       text check (source in ('photo','text','restaurant','barcode')),
  name         text not null,
  calories     numeric not null,
  protein      numeric default 0,
  carbs        numeric default 0,
  fats         numeric default 0,
  fiber        numeric default 0,
  raw_response jsonb
);

create index on saved_meals(user_id, created_at);

alter table saved_meals enable row level security;

create policy saved_meals_owner on saved_meals
  for all using (auth.uid() = user_id);

-- Same as 002, plus moving saved meals into the linked account.
create or replace function public.merge_anonymous_account(p_from uuid, p_to uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_from is null or p_to is null or p_from = p_to then
    raise exception 'merge_anonymous_account: invalid accounts';
  end if;
  if not exists (select 1 from users where id = p_to) then
    raise exception 'merge_anonymous_account: target account has no users row';
  end if;

  -- Serialize concurrent merges touching either account.
  perform 1 from users where id in (p_from, p_to) for update;

  update food_logs set user_id = p_to where user_id = p_from;
  update saved_meals set user_id = p_to where user_id = p_from;

  -- Same day on both: add what was eaten, keep the higher burn, and prefer
  -- the account's own Whoop strain/recovery.
  insert into daily_summaries (user_id, date, calories_burned, calories_consumed, whoop_strain, whoop_recovery, updated_at)
  select p_to, date, calories_burned, calories_consumed, whoop_strain, whoop_recovery, now()
  from daily_summaries
  where user_id = p_from
  on conflict (user_id, date) do update set
    calories_consumed = coalesce(daily_summaries.calories_consumed, 0) + coalesce(excluded.calories_consumed, 0),
    calories_burned   = greatest(daily_summaries.calories_burned, excluded.calories_burned),
    whoop_strain      = coalesce(daily_summaries.whoop_strain, excluded.whoop_strain),
    whoop_recovery    = coalesce(daily_summaries.whoop_recovery, excluded.whoop_recovery),
    updated_at        = now();

  delete from daily_summaries where user_id = p_from;
  delete from users where id = p_from;
end;
$$;

revoke all on function public.merge_anonymous_account(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_anonymous_account(uuid, uuid) to service_role;
