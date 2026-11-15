# Rollout: one Dimer account per Whoop user

Run these from the repo root, logged in with `supabase login` and linked to
`dxyutzlddddgzjfmuwel`. The steps are in order; each is safe to stop after.
The design is in `docs/superpowers/specs/2026-11-14-whoop-account-linking-design.md`.

## 0. Before: snapshot (read-only)

```sh
supabase db query --remote --read-only "
select (u.whoop_user_id = u.id::text) as placeholder_row, a.is_anonymous, a.email is not null as has_email,
       (select count(*) from food_logs f where f.user_id = u.id) as food_logs,
       (select count(*) from daily_summaries d where d.user_id = u.id) as summaries
from users u join auth.users a on a.id = u.id order by u.created_at"
```

State on 2026-11-14:

| placeholder_row | food_logs | summaries | what it is |
|---|---|---|---|
| false | 6 | 1 | earlier Safari session, holds your Whoop id: **this becomes your account** |
| true | 1 | 1 | home-screen app session (Red Bull, 2026-11-14) |

No backfill is needed. The Safari row already is the account, and the
home-screen app's entry moves into it automatically the first time that app
opens after step 3.

## 1. Apply the migration

```sh
supabase db push
```

The remote history already records `001`, so this applies only
`002_merge_anonymous_account.sql`. It adds one function and changes no
tables or data. The CLI lists what it will apply and asks you to confirm.

Check (read-only). Expect `true | false | false`:

```sh
supabase db query --remote --read-only "
select has_function_privilege('service_role',  'public.merge_anonymous_account(uuid,uuid)', 'execute') as service_role,
       has_function_privilege('authenticated', 'public.merge_anonymous_account(uuid,uuid)', 'execute') as authenticated,
       has_function_privilege('anon',          'public.merge_anonymous_account(uuid,uuid)', 'execute') as anon"
```

## 2. Deploy the edge function

```sh
supabase functions deploy whoop-signin
```

It needs no new secrets: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
provided by the platform. `verify_jwt` stays at its default (on).

## 3. Merge the PR

Vercel deploys the app. Do this **after** steps 1–2: an app that can't reach
`whoop-signin` only logs the failure and retries on its next launch, but
nothing links until the function exists.

## 4. Link the devices

1. **Safari**: open dimer-phi.vercel.app. This session already holds your
   Whoop id, so it stays as is. The server gives the account its hidden
   `whoop-<id>@users.dimer.invalid` address, which turns it from anonymous
   into a permanent account. Nothing visible changes.
2. **Home-screen app**: swipe it closed and reopen it. On launch it moves the
   Red Bull entry and today's summary into your account, deletes its empty
   anonymous user, and signs in to your account. It should now show the same
   log as Safari.

## 5. After: verify (read-only)

Run the step 0 query again. Expected: **one** row, with
`placeholder_row = false`, `is_anonymous = false`, `has_email = true`,
`food_logs = 7`, `summaries = 2`.

If something looks wrong, stop and don't reinstall the apps: every step
above keeps all rows. The merge only ever moves rows, inside one
transaction.
