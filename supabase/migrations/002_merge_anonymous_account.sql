-- supabase/migrations/002_merge_anonymous_account.sql
--
-- Moves everything an anonymous device session logged into the Dimer account
-- it is being linked to (see supabase/functions/whoop-signin). Runs in one
-- transaction: either all rows move or none do.
--
-- Callable only by the service role (the whoop-signin edge function). Browsers
-- (anon / authenticated roles) cannot execute it, so RLS stays the only way
-- sessions reach rows.

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
