# History, and one day = one Whoop cycle

Date: 2026-11-15 · Status: draft, awaiting approval

## Intent

Two problems, one fix.

1. **Eaten and burned reset at different times.** Food is filed under the
   local calendar date (`ConfirmFoodCard` writes `date = localDateString()`,
   `useFoodLog` reads `date = today`), so it resets at midnight. Burned is the
   open Whoop cycle (`lib/whoopCycles.ts`), which starts when you fall asleep
   and only appears once Whoop has processed that sleep, usually after waking.
   Between midnight and bedtime the food side is empty while burned still
   shows the whole day, and a 12:30am snack counts against the wrong day.
2. **History is a "Coming soon" placeholder.** The user wants to look back
   and see, per day, whether they were under or over their burn and by how
   much; a running total for a chosen period (a week, a month); and, for any
   day, what they ate plus that day's burned and eaten.

**Fix:** a day is a Whoop cycle, for both numbers. Food belongs to the cycle
its `logged_at` falls in. Past cycles are saved in the database so History
reads from there.

## Goals

- Today's eaten and burned reset together, when Whoop starts the new cycle.
- Food is placed into a day by `logged_at` at read time, so a snack eaten
  before bed stays with that day even though the app couldn't know at save
  time when the user would sleep.
- Each time the app opens (and comes back to the foreground), it fetches
  from Whoop every cycle since the last one saved, so days the app wasn't
  opened get filled in.
- History tab: per-day under/over, a period total for Week or Month, and a
  day detail screen.

## Non-goals

- A server-side or scheduled sync. Whoop tokens stay on the device (moving
  them would need the server to own the rotating refresh token; rejected in
  discussion). History is only as fresh as the last app open.
- Adding, editing or moving food on past days.
- Custom date ranges. Week and Month only for now.
- Charts. A list with numbers is enough to answer "under or over, by how
  much".
- Recovery. It's always `null` today and stays that way.

## Anti-goals

- A forgotten day (no food logged) counting as a huge deficit in a total.
- History blocking on Whoop: the sync runs in the background, History
  renders from what's stored.
- Today's numbers getting worse than today: if Whoop is unreachable, Today
  still shows food since the last known cycle start.

## Constraints (verified 2026-11-15 from the code)

- Whoop tokens live only on the device (`lib/whoop.ts` `KEYS`). All Whoop
  calls go through the `whoop-proxy` edge function.
- Whoop v2 `GET /cycle` takes `start`, `end`, `limit` (max 25) and
  `nextToken`; returns `records` (`id`, `start`, `end` or null for the open
  cycle, `timezone_offset`, `score_state` `SCORED | PENDING_SCORE |
  UNSCORABLE`, `score.kilojoule`, `score.strain`) and `next_token`. It
  returns cycles that overlap the window, newest first.
- `daily_summaries.calories_burned` is never written; `calories_consumed`
  is incremented on save, never decremented on delete, and keyed by calendar
  date. It's unreliable and History must not use it.
- `merge_anonymous_account` (migration 002) moves `food_logs` and
  `daily_summaries`, then deletes the anonymous `users` row.
- `food_logs.date` is `NOT NULL`.

## Approaches considered

1. **Fetch cycles from Whoop live whenever History opens.** No schema change
   and always current, but History needs Whoop to be reachable. Not picked:
   the user prefers stored data.
2. **Store cycles; sync on app open, from the last saved cycle.** **Picked.**
   No server tokens, no scheduler. Gaps fill the next time the app opens.
3. **Store cycles; a scheduled server job syncs them.** Fresh even if the
   app is never opened, but the server would have to become the sole owner
   of Whoop's rotating refresh token, and every token refresh would move
   server-side. Rejected as too much for the gain.

## Design

### Storage: new `whoop_cycles` table (migration 003)

```
whoop_cycles(
  user_id     uuid not null references users(id) on delete cascade,
  cycle_id    bigint not null,          -- Whoop's cycle id
  start       timestamptz not null,
  "end"       timestamptz,              -- null while open
  tz_offset   text,                     -- Whoop's timezone_offset, e.g. "-08:00"
  day         date not null,            -- label, see below
  score_state text not null,
  burned      integer,                  -- round(kilojoule / 4.184); null if unscored
  strain      numeric,
  updated_at  timestamptz default now(),
  primary key (user_id, cycle_id)
)
index on (user_id, start)
RLS: whoop_cycles_owner FOR ALL USING (auth.uid() = user_id)
```

**My call: a new table, not `daily_summaries`.** A cycle is the unit, and
two cycles can share a label in rare cases (shift work). `daily_summaries`
is keyed by `(user_id, date)` and carries a broken consumed total. It
stays as is and unused by the new code; removing it is a later cleanup.

Account merge: `whoop_cycles` rows cascade-delete with the anonymous
`users` row, and the target account re-syncs them, since they come from
the same Whoop user. No change to migration 002.

### Day label

`day` = the local date (using the cycle's own `timezone_offset`) of
`start + 12h`. A cycle that starts at 11pm Friday is "Saturday", as in
the Whoop app; one that starts at 2am Saturday is also "Saturday".

### Sync (`lib/cycleSync.ts`, run from the app root)

When: on startup once a Whoop token exists, and on each return to the
foreground. Not blocking; at most one run at a time.

1. Work out **from**:
   - The earliest `start` among the user's stored cycles that are still open
     (`end is null`) or `PENDING_SCORE`, if any. This re-fetches the cycles
     Whoop hadn't finished.
   - Otherwise, the latest stored `start`.
   - With nothing stored (first run): the earliest `food_logs.logged_at` for
     the user, or 30 days ago if that is later or there are no logs. Whoop is
     paged at 25, so a long backfill is a handful of requests, once.
2. `GET /cycle?start=<from>&limit=25`, following `next_token` until it runs
   out.
3. Upsert every record on `(user_id, cycle_id)`.

Failures (no token, 401, proxy down) are logged and skipped. The next open
tries again from the same point. `UNSCORABLE` is final and not re-fetched.

### Grouping food into days (`lib/days.ts`, pure, unit-tested)

Input: cycles sorted by start, and food logs. Each log goes into the cycle
with `start <= logged_at < end` (an open cycle's end is "now"). A log that
fits no cycle (before Whoop was connected, or in a gap) goes into a
**midnight fallback day** for its local date, with burned unknown.

Output, per day: label, start/end, burned (or null), eaten, macros, logs,
`inProgress` (the open cycle), and `net = burned - eaten`. Positive means
under; negative means over.

### Today (dashboard and Log tab)

- `useFoodLog` reads food with `logged_at >= currentCycleStart` instead of
  `date = today`. Current cycle start comes from the live Whoop fetch, falling
  back to the latest stored cycle, then to local midnight if there's no Whoop.
- The realtime subscription drops the `date=eq.` filter (RLS already scopes
  rows to the user) and just refetches.
- `ConfirmFoodCard` keeps writing `date = localDateString()` so the column
  stays populated, and stops updating `daily_summaries`. Nothing reads
  `food_logs.date` for grouping anymore.
- The dashboard header shows the cycle's day label instead of `new Date()`.
  After midnight and before sleep it still says the previous day.

### History tab

```
History            [ Week | Month ]
        ‹  Nov 9 – 15  ›
   2,340 kcal under · 6 of 7 days logged
 ─────────────────────────────────────
 Sun 15  in progress         420 under
  Sat 14                      180 over
  Fri 13                      610 under
 Thu 12  not logged              —
 ...
```

- Week (Mon–Sun, my call) or Month, with ‹ › to step periods. It opens on
  the current week. You can't step past the current period.
- Data: stored cycles whose `day` is in the period, plus food with
  `logged_at` in the span from the first cycle's start to the last cycle's
  end (or the period's midnight bounds where there are no cycles).
- Row states:
  - **under / over** with the amount: burned is known and at least one food
    log.
  - **not logged**: has burn, no food. Shown, excluded from the total.
  - **no Whoop data**: food but no cycle (fallback day). Shows eaten only,
    excluded from the total.
  - **in progress**: today. Included in the total, marked as such.
- Total: sum of `net` over the included days, with "N of M days logged".
- Under uses the primary color and over uses `danger`, matching the
  dashboard ring.
- Pull to refresh runs the sync, then reloads.

### Day detail (`app/(tabs)/history/[day].tsx`)

Tap a row → burned, eaten, under/over by how much, macros (reusing
`MacroBar`), strain, and the food list (reusing `FoodLogItem`, read-only:
no swipe-to-delete). Route param is the cycle id, or `d-YYYY-MM-DD` for a
fallback day.

## Tests

Unit tests (Jest, existing setup) for the pure parts: the day label (time
zones, around midnight), sync **from** selection, grouping food into
cycles and fallback days, and period totals with the not-logged /
no-Whoop exclusions.

## Rollout

1. Apply migration 003 (`supabase db push --remote`, as in the linking
   rollout).
2. Merge; Vercel deploys. The first open runs the backfill.

## Left to the builder

Component breakdown, hook names, loading and empty states, exact styling
within `lib/theme.ts` and `design-system/dimer/MASTER.md`.
