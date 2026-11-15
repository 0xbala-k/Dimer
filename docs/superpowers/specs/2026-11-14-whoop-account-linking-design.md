# One account per Whoop user (cross-device account linking)

Date: 2026-11-14 · Status: proposed

## Intent

Dimer identifies people with a per-device **anonymous** Supabase user. Each
browser, Safari profile or installed PWA gets its own, so the same person ends
up with several accounts:

- Food logged on the iPhone PWA is invisible in Safari, and the reverse.
- Linking Whoop on a second device fails. `public.users.whoop_user_id` is
  `UNIQUE`, and the first device's row already holds it. `syncUserRow` gets
  Postgres 23505 on every app start. This was seen live on 2026-11-14 at
  22:56 UTC.

**Goal:** the Whoop account *is* the Dimer account. Connecting Whoop on any
device puts that device into the one Dimer account for that Whoop user, with
all its food logs and summaries, and keeps anything already logged on the
device.

## Goals

- Connecting Whoop on a new device joins the existing account for that Whoop
  user.
- Entries made on the device before linking (anonymous session) are moved into
  the account, not lost.
- The first device to connect a given Whoop user becomes that account.
- Devices that are already linked keep working without signing in again.
- The startup 23505 error goes away.

## Non-goals

- Email/password or any login other than Whoop.
- Moving Whoop OAuth tokens server-side. They stay per device, as today.
- Cleaning up the ~39 orphan anonymous auth users left by tests and bots.
  That's a separate cleanup.
- Changing RLS. Every row still belongs to exactly one `auth.uid()`.

## Anti-goals (failure even if it "works")

- Any way into an account without a valid Whoop access token for that Whoop
  user. The Whoop id must come from Whoop's API, never from the client.
- Losing or duplicating food entries during a merge.
- Sending email to anyone, or a synthetic address ever being deliverable.
- Service-role credentials or Whoop tokens reaching logs or the client.

## Constraints (verified 2026-11-14, read-only)

- Supabase project `dxyutzlddddgzjfmuwel`:
  - Email provider enabled, anonymous sign-ins enabled, `mailer_autoconfirm`
    false.
  - All 41 auth users are anonymous; none has an email.
  - RLS: `users_self`, `food_logs_owner`, `daily_summaries_owner`, each
    `FOR ALL USING (auth.uid() = <owner col>)`.
  - No custom SQL functions yet.
- `food_logs.user_id` and `daily_summaries.user_id` reference `users(id)
  ON DELETE CASCADE`. `users.id` references `auth.users(id) ON DELETE CASCADE`.
  Deleting an auth user before its rows are moved would delete its food logs.
- `daily_summaries` has `UNIQUE (user_id, date)`.
- The client already holds a Whoop access token after OAuth (`lib/whoop.ts`).
  Whoop v2 `GET /developer/v2/user/profile/basic` returns `user_id`.
- Edge functions get `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the
  platform.

## Approaches considered

- **A. Whoop sign-in signs the device into the existing account (chosen).**
  A privileged edge function verifies the Whoop token with Whoop. It finds the
  account that owns that Whoop id and returns a one-time sign-in token for it.
  The client redeems the token, so the device becomes that same Supabase user.
  Prior anonymous data is merged in first. RLS and data shape stay as they are.
  Trade-off: service-role code plus a deploy, and the account gets a synthetic
  email so Supabase can mint the one-time token.
- **B. Keep a user per device and add a linked-devices table.** Every policy
  becomes "rows of any device sharing my Whoop id". Needs a migration of all
  policies, and the rules get more complex and easier to get wrong. Rejected.
- **C. Move the data to whichever device connected last.** The previous device
  loses its data, and two devices would keep pulling it back and forth.
  Rejected.

Chosen by the user: **A**.

## Design

### 1. Edge function `whoop-signin` (new, separate from `whoop-proxy`)

Kept separate so the unprivileged proxy never holds the service-role key.
`verify_jwt` stays on, so the caller must send its current Supabase session
JWT (supabase-js `functions.invoke` does this).

Request: `{ access_token: <Whoop access token> }`. Steps:

1. **Identify the caller.** `admin.auth.getUser(<caller JWT>)` gives
   `callerId` and `callerIsAnonymous`.
2. **Verify Whoop.** `GET https://api.prod.whoop.com/developer/v2/user/profile/basic`
   with the Whoop token. Anything other than 200 with a `user_id` returns
   `{ error: 'whoop_unauthorized' }`. The value is `whoopId = String(user_id)`.
3. **Find the owner.** Select `id` from `public.users` where
   `whoop_user_id = whoopId`, using the service role.
4. **Decide:**
   - **No owner.** The caller claims the account. Upsert
     `users { id: callerId, whoop_user_id: whoopId }` (on conflict `id`, update
     `whoop_user_id`). Ensure the caller has the synthetic email (step 5).
     Return `{ result: 'claimed' }`; the client keeps its session. If the
     upsert hits 23505 (another device claimed it at the same moment), go back
     to step 3 once.
   - **Owner is the caller.** Ensure the synthetic email. Return
     `{ result: 'already_linked' }`.
   - **Owner is someone else.**
     1. Ensure the owner has the synthetic email.
     2. `admin.auth.admin.generateLink({ type: 'magiclink', email })` and take
        `properties.hashed_token`. If this fails, stop here, before any merge.
     3. If the caller is anonymous, call
        `rpc('merge_anonymous_account', { p_from: callerId, p_to: ownerId })`.
        Then delete the caller's auth user (best effort; failure is only
        logged). A non-anonymous caller is never merged or deleted.
     4. Return `{ result: 'switch', token_hash }`.
5. **Synthetic email:** `whoop-<whoopId>@users.dimer.invalid`, set with
   `admin.updateUserById(id, { email, email_confirm: true })`. This also turns
   an anonymous user into a permanent one. `.invalid` is a reserved TLD that
   can never be delivered to, and `generateLink` sends no mail.
   (Builder: if GoTrue rejects the `.invalid` domain, use another reserved,
   non-routable domain and note it here.)

Errors return a JSON `{ error }` with a short code. Nothing logs tokens or the
JWT.

### 2. Migration `002_merge_anonymous_account.sql`

`public.merge_anonymous_account(p_from uuid, p_to uuid)`:
`SECURITY DEFINER`, `search_path = public`, one transaction.
`EXECUTE` is revoked from `public`, `anon` and `authenticated`, and granted
only to `service_role`.

- `update food_logs set user_id = p_to where user_id = p_from`.
- Merge `daily_summaries` rows of `p_from` into `p_to` per date. On a
  `(user_id, date)` conflict, add the `calories_consumed` values together,
  take `greatest(calories_burned)`, and keep the owner's `whoop_strain` and
  `whoop_recovery`, falling back to `p_from`'s. Then delete `p_from`'s
  summaries.
- `delete from users where id = p_from`.
- Raise if `p_from = p_to` or `p_to` has no `users` row.

Written to the repo. **Applied only with the user's go-ahead.**

### 3. Client

- `lib/auth.ts`: new `linkWhoopAccount()`.
  1. Get a valid Whoop token.
  2. Invoke `whoop-signin`.
  3. On `switch`, call
     `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })`, which
     replaces the stored session.
  4. Store `dimer_linked_uid = <current auth uid>`.

  It returns the outcome and throws on failure.
- `app/login.tsx`: after a successful Whoop token exchange, call
  `linkWhoopAccount()` instead of `syncUserRow()`, then go to the dashboard.
- `app/_layout.tsx` bootstrap: if a Whoop token exists and `dimer_linked_uid`
  is not the current session's uid, call `linkWhoopAccount()` (inside the
  existing 12 s timeout). This links already-installed devices, like your PWA,
  on next launch. Failures are logged and the app still opens.
- `syncUserRow` is removed (the edge function owns the Whoop id now).
  `ensureUserRow` stays for saving before Whoop is linked.

### 4. Rollout (each step needs the user's OK)

1. Apply migration 002.
2. Deploy `whoop-signin`.
3. Merge the PR. Vercel deploys the client.
4. On next launch of the PWA, its Whoop token triggers linking. The Safari
   account (current owner of the Whoop id) becomes the account. The PWA's
   Red Bull entry and summary merge into it, and the PWA anonymous user is
   deleted. Safari keeps its session (same uid, now permanent).

## Testing

- Unit (jest): `linkWhoopAccount` outcomes with supabase mocked (claimed,
  already_linked, switch calls `verifyOtp`, error paths). Bootstrap decides
  when to link.
- Function: tested against the live project after deploy, with the user's OK,
  using the real devices:
  1. PWA launch merges and switches.
  2. Safari unaffected.
  3. A second launch does nothing.
  4. Read-only SQL confirms entry counts before and after (no loss, no
     duplicates) and that the PWA anonymous user is gone.
- `tsc`, `jest`, web export.

## Left to the builder

- Exact module layout inside the function. The decision logic should be a
  plain function so it can be unit-tested if a Deno/test setup is cheap.
- Error code names and client messages (short, friendly).
- Whether the merge function also handles the case where `p_to` is missing a
  `users` row (it raises; the function guarantees the owner row exists).
